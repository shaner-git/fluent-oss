import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { FluentDatabase, FluentPreparedStatement, FluentStatementResult } from '../storage';

type BindValue = string | number | bigint | Uint8Array | null;

export class SqliteD1Database implements FluentDatabase {
  readonly sqlite: DatabaseSync;

  constructor(filePath: string) {
    this.sqlite = new DatabaseSync(filePath);
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(query: string): FluentPreparedStatement {
    return new SqlitePreparedStatement(this.sqlite, query);
  }

  async batch<T = unknown>(statements: FluentPreparedStatement[]): Promise<FluentStatementResult<T>[]> {
    const results: FluentStatementResult<T>[] = [];
    this.sqlite.exec('BEGIN TRANSACTION;');
    try {
      for (const statement of statements as SqlitePreparedStatement[]) {
        const runResult = await statement.run();
        results.push({
          success: true,
          meta: runResult.meta,
          results: [] as T[],
        });
      }
      this.sqlite.exec('COMMIT;');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK;');
      throw error;
    }
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.sqlite.exec(query);
    return {
      count: 0,
      duration: 0,
    };
  }

  withSession(_constraintOrBookmark?: string | D1SessionBookmark | null): D1DatabaseSession {
    throw new Error('Local Fluent SQLite adapter does not support D1 sessions.');
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('Local Fluent SQLite adapter does not support dump().');
  }

  close(): void {
    this.sqlite.close();
  }
}

class SqlitePreparedStatement {
  private bindings: BindValue[] = [];
  private readonly statement: StatementSync;

  constructor(private readonly db: DatabaseSync, private readonly query: string) {
    this.statement = db.prepare(query);
  }

  bind(...values: unknown[]): SqlitePreparedStatement {
    this.bindings = values.map(normalizeBinding);
    return this;
  }

  async first<T>(): Promise<T | null> {
    const row = this.statement.get(...this.bindings) as T | undefined;
    return row ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const rows = this.statement.all(...this.bindings) as T[];
    return { results: rows };
  }

  async run<T = unknown>(): Promise<FluentStatementResult<T>> {
    const result = this.statement.run(...this.bindings);
    return {
      success: true,
      meta: {
        changes: Number(result.changes ?? 0),
        last_row_id: Number(result.lastInsertRowid ?? 0),
      },
      results: [] as T[],
    };
  }

  // Compatibility helper for local bootstrap and imports.
  exec(): void {
    this.statement.run(...this.bindings);
  }
}

function normalizeBinding(value: unknown): BindValue {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return JSON.stringify(value);
}
