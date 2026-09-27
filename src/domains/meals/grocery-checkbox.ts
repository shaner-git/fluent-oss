import type { FluentDatabase, FluentPreparedStatement } from '../../storage';
import type { ApplyGroceryShoppingResultRecord } from './types-extra';

type Row = Record<string, string | number | null>;
export type CheckboxChange = {
  table: 'grocery_intents' | 'meal_grocery_plan_actions' | 'meal_inventory_items';
  before: Row | null;
  after: Row | null;
};
export type GroceryCheckboxInput = { itemKey: string; checked: boolean; purchaseId?: string };
export type CheckboxReceipt = ApplyGroceryShoppingResultRecord & {
  checkbox: GroceryCheckboxInput & { purchaseId: string; name: string };
};

// The receipt and both list/inventory writes share one transaction. A receipt
// is only inserted when every observed row still matches. Retrying an operation
// returns its receipt; it never repeats the mutation or widens its scope.
export async function commitGroceryCheckbox(db: FluentDatabase, input: {
  tenantId: string; idempotencyKey: string; fingerprint: string; listId: string;
  listVersion: string; weekStart: string; checkbox: GroceryCheckboxInput;
  name: string; changes: CheckboxChange[]; undoPurchaseId?: string;
}): Promise<CheckboxReceipt> {
  const replay = await readCheckboxReceipt(db, input.tenantId, input.idempotencyKey, input.fingerprint);
  if (replay) return replay;
  const now = new Date().toISOString(), token = crypto.randomUUID();
  const id = `grocery-checkbox:${crypto.randomUUID()}`;
  const result: CheckboxReceipt = {
    idempotencyKey: input.idempotencyKey, listId: input.listId, listVersion: input.listVersion,
    weekStart: input.weekStart, outcome: 'confirmed', replayed: false, appliedCount: 1,
    planItems: [], manualIntents: [], inventoryRefreshed: input.checkbox.checked ? [{ name: input.name }] : [],
    rows: [], skipped: [], checkbox: { ...input.checkbox,
      purchaseId: input.undoPurchaseId || input.idempotencyKey, name: input.name },
  };
  const guardValues: unknown[] = [];
  const guards = input.changes.map(change => {
    const row = change.before;
    if (!row) {
      guardValues.push(input.tenantId, change.after!.id);
      return `NOT EXISTS (SELECT 1 FROM ${change.table} WHERE tenant_id = ? AND id = ?)`;
    }
    const fields = Object.keys(row);
    fields.forEach(field => { guardValues.push(row[field]); });
    return `EXISTS (SELECT 1 FROM ${change.table} WHERE ${fields.map(field =>
      `${field} IS NOT DISTINCT FROM ?`).join(' AND ')})`;
  });
  if (input.undoPurchaseId) {
    guards.push("EXISTS (SELECT 1 FROM meal_grocery_shopping_receipts WHERE tenant_id = ? AND idempotency_key = ? AND status = 'checkbox_checked')");
    guardValues.push(input.tenantId, input.undoPurchaseId);
  }
  const statements: FluentPreparedStatement[] = [db.prepare(`INSERT INTO meal_grocery_shopping_receipts
    (id, tenant_id, idempotency_key, request_fingerprint, list_id, list_version, week_start,
     subset_json, status, execution_token, lease_expires_at, result_json, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guards.join(' AND ')}
    ON CONFLICT(tenant_id, idempotency_key) DO NOTHING`).bind(id, input.tenantId, input.idempotencyKey,
      input.fingerprint, input.listId, input.listVersion, input.weekStart, JSON.stringify(input.changes),
      input.checkbox.checked ? 'checkbox_checked' : 'checkbox_undo', token, now, JSON.stringify(result), now, now, ...guardValues)];
  const gate = 'EXISTS (SELECT 1 FROM meal_grocery_shopping_receipts WHERE tenant_id = ? AND id = ? AND execution_token = ?)';
  const gateValues = [input.tenantId, id, token];
  for (const change of input.changes) {
    if (!change.after) {
      statements.push(db.prepare(`DELETE FROM ${change.table} WHERE tenant_id = ? AND id = ? AND ${gate}`)
        .bind(input.tenantId, change.before!.id, ...gateValues));
      continue;
    }
    const fields = Object.keys(change.after);
    statements.push(db.prepare(`INSERT INTO ${change.table} (${fields.join(',')})
      SELECT ${fields.map(() => '?').join(',')} WHERE ${gate}
      ON CONFLICT(id) DO UPDATE SET ${fields.filter(f => f !== 'id').map(f => `${f} = excluded.${f}`).join(',')}
      WHERE ${change.table}.tenant_id = excluded.tenant_id`)
      .bind(...fields.map(f => change.after![f]), ...gateValues));
  }
  if (input.undoPurchaseId) {
    statements.push(db.prepare(`UPDATE meal_grocery_shopping_receipts SET status = 'checkbox_undone', updated_at = ?
      WHERE tenant_id = ? AND idempotency_key = ? AND ${gate}`)
      .bind(now, input.tenantId, input.undoPurchaseId, ...gateValues));
  }
  await db.batch(statements);
  const receipt = await readCheckboxReceipt(db, input.tenantId, input.idempotencyKey, input.fingerprint);
  if (!receipt) throw new Error('This item or its kitchen record changed. Refresh the list before trying again.');
  return receipt;
}

export async function readCheckboxReceipt(db: FluentDatabase, tenantId: string, key: string, fingerprint: string) {
  const row = await db.prepare('SELECT request_fingerprint, result_json FROM meal_grocery_shopping_receipts WHERE tenant_id = ? AND idempotency_key = ?')
    .bind(tenantId, key).first<{ request_fingerprint: string; result_json: string | null }>();
  if (!row) return null;
  if (row.request_fingerprint !== fingerprint) throw new Error('This retry identity belongs to a different change.');
  const receipt = JSON.parse(row.result_json || 'null') as CheckboxReceipt | null;
  if (!receipt?.checkbox) throw new Error('Checkbox receipt unavailable.');
  return { ...receipt, replayed: true };
}
