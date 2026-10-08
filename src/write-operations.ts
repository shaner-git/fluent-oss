// Retry-safe writes for tools with no natural idempotency key (plan #6: save_recipe,
// record_recipe_feedback). A host-generated operation_id is claimed BEFORE the write, so two
// concurrent retries can never both write; the claim records the committed result's id, and a
// later retry with the same id and payload replays that result instead of writing again.
import { getFluentIdentityContext } from './fluent-identity';
import type { FluentDatabase } from './storage';

export type WriteOperationTool = 'fluent_record_recipe_feedback' | 'fluent_save_recipe';

// A claim with no result after this long belongs to an attempt that died mid-write; take it over.
const STALE_CLAIM_MS = 5 * 60 * 1000;
/** Stored when a committed write has no result id; still marks the claim complete. */
export const COMMITTED_WITHOUT_REF = 'committed';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface WriteOperationOutcome<T> {
  replayed: boolean;
  result: T;
}

export class WriteOperationsStore {
  constructor(private readonly db: FluentDatabase) {}

  async run<T>(
    input: { operationId: string | null | undefined; request: unknown; tool: WriteOperationTool },
    execute: () => Promise<{ result: T; resultRef: string | null }>,
    // resultRef is null when the write committed without a result id (COMMITTED_WITHOUT_REF).
    replay: (resultRef: string | null) => Promise<T>,
  ): Promise<WriteOperationOutcome<T>> {
    const operationId = input.operationId?.trim().toLowerCase() || null;
    if (!operationId) return { replayed: false, result: (await execute()).result };
    if (!UUID_PATTERN.test(operationId)) throw new Error('operation_id must be a UUID.');
    const tenantId = getFluentIdentityContext().tenantId;
    const requestSha256 = await sha256Hex(canonicalJson(input.request));

    const claimed = await this.claim(tenantId, input.tool, operationId, requestSha256);
    if (!claimed) {
      const existing = await this.db
        .prepare(`SELECT request_sha256, result_ref, created_at FROM fluent_write_operations WHERE tenant_id = ? AND tool = ? AND operation_id = ?`)
        .bind(tenantId, input.tool, operationId)
        .first<{ created_at: string; request_sha256: string; result_ref: string | null }>();
      if (!existing) throw new Error('The operation_id claim could not be read. Nothing was saved; retry with the same operation_id.');
      if (existing.request_sha256 !== requestSha256) {
        throw new Error(
          'This operation_id was already used for a different request. Nothing new was saved. '
          + 'Use a new operation_id for a different write, or resend the original values to retry it.',
        );
      }
      if (existing.result_ref) {
        return { replayed: true, result: await replay(existing.result_ref === COMMITTED_WITHOUT_REF ? null : existing.result_ref) };
      }
      if (!(await this.takeOverStaleClaim(tenantId, input.tool, operationId, existing.created_at))) {
        throw new Error(
          'An earlier attempt with this operation_id is still in progress. Nothing new was saved. '
          + 'Wait a moment and retry with the same operation_id.',
        );
      }
    }

    let outcome: { result: T; resultRef: string | null };
    try {
      outcome = await execute();
    } catch (error) {
      // Release the claim so a retry can run the write; the failed attempt committed nothing.
      await this.db
        .prepare(`DELETE FROM fluent_write_operations WHERE tenant_id = ? AND tool = ? AND operation_id = ? AND result_ref IS NULL`)
        .bind(tenantId, input.tool, operationId)
        .run()
        .catch(() => undefined);
      throw error;
    }
    await this.db
      .prepare(`UPDATE fluent_write_operations SET result_ref = ? WHERE tenant_id = ? AND tool = ? AND operation_id = ?`)
      .bind(outcome.resultRef || COMMITTED_WITHOUT_REF, tenantId, input.tool, operationId)
      .run();
    return { replayed: false, result: outcome.result };
  }

  private async claim(tenantId: string, tool: WriteOperationTool, operationId: string, requestSha256: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO fluent_write_operations (tenant_id, tool, operation_id, request_sha256, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, tool, operation_id) DO NOTHING`,
      )
      .bind(tenantId, tool, operationId, requestSha256, new Date().toISOString())
      .run();
    return Number(result.meta?.changes ?? 0) === 1;
  }

  // Atomic takeover: only one retry can move a stale, result-less claim forward.
  private async takeOverStaleClaim(tenantId: string, tool: WriteOperationTool, operationId: string, createdAt: string): Promise<boolean> {
    const age = Date.now() - Date.parse(createdAt);
    if (!Number.isFinite(age) || age < STALE_CLAIM_MS) return false;
    const result = await this.db
      .prepare(
        `UPDATE fluent_write_operations SET created_at = ?
         WHERE tenant_id = ? AND tool = ? AND operation_id = ? AND result_ref IS NULL AND created_at = ?`,
      )
      .bind(new Date().toISOString(), tenantId, tool, operationId, createdAt)
      .run();
    return Number(result.meta?.changes ?? 0) === 1;
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
