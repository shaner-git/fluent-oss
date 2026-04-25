/* Minimal worker type stubs for the public Fluent open-source runtime repo. */
interface D1ResultMeta {
  changes?: number;
  last_row_id?: number | string;
}

interface D1Result<T = unknown> {
  meta?: D1ResultMeta;
  results?: T[];
  success?: boolean;
}

interface D1ExecResult {
  count: number;
  duration: number;
}

type HeadersInit = Headers | Array<[string, string]> | Record<string, string>;
type BodyInit = string | ArrayBuffer | ArrayBufferView | Blob | FormData | URLSearchParams | ReadableStream<Uint8Array>;

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(columnName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1SessionBookmark {}
interface D1DatabaseSession {}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec?(query: string): Promise<D1ExecResult>;
}

interface KVNamespace {}
interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
interface DurableObjectNamespace {}
interface Workflow<T = unknown> {}

interface R2HTTPMetadata {
  cacheControl?: string;
  cacheExpiry?: Date;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  contentType?: string;
}

interface R2PutOptions {
  customMetadata?: Record<string, string>;
  httpMetadata?: R2HTTPMetadata;
}

interface R2Object {
  customMetadata?: Record<string, string>;
  httpMetadata?: R2HTTPMetadata;
  key: string;
  size: number;
  uploaded: Date;
}

interface R2ObjectBody extends R2Object {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  put(key: string, body: BodyInit | null, options?: R2PutOptions): Promise<void>;
  delete(key: string): Promise<void>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
