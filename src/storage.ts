export interface FluentStatementMeta {
  changes: number;
  last_row_id: number;
}

export interface FluentStatementResult<T = unknown> {
  success: true;
  meta: FluentStatementMeta;
  results: T[];
}

export interface FluentPreparedStatement {
  bind(...values: unknown[]): FluentPreparedStatement;
  first<T = unknown>(columnName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run<T = unknown>(): Promise<FluentStatementResult<T>>;
}

type WrappedCloudflarePreparedStatement = FluentPreparedStatement & {
  __rawD1PreparedStatement: D1PreparedStatement;
};

export interface FluentExecResult {
  count: number;
  duration: number;
}

export interface FluentDatabase {
  prepare(query: string): FluentPreparedStatement;
  batch<T = unknown>(statements: FluentPreparedStatement[]): Promise<FluentStatementResult<T>[]>;
  exec?(query: string): Promise<FluentExecResult>;
}

export interface FluentBlobHttpMetadata {
  cacheControl?: string;
  cacheExpiry?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  contentType?: string;
}

export interface FluentBlobObject {
  arrayBuffer(): Promise<ArrayBuffer>;
  customMetadata?: Record<string, string>;
  httpMetadata?: FluentBlobHttpMetadata;
  key: string;
  size: number;
  uploaded: Date;
}

export interface FluentBlobStorePutOptions {
  customMetadata?: Record<string, string>;
  httpMetadata?: FluentBlobHttpMetadata;
}

export interface FluentBlobStore {
  get(key: string): Promise<FluentBlobObject | null>;
  put(key: string, body: BodyInit | null, options?: FluentBlobStorePutOptions): Promise<void>;
  delete?(key: string): Promise<void>;
  head?(key: string): Promise<Omit<FluentBlobObject, 'arrayBuffer'> | null>;
}

export function wrapCloudflareDatabase(db: D1Database): FluentDatabase {
  return {
    async batch<T = unknown>(statements: FluentPreparedStatement[]): Promise<FluentStatementResult<T>[]> {
      const underlying = statements.map((statement) => toD1PreparedStatement(statement));
      const results = await db.batch<T>(underlying);
      return results.map((result) => ({
        success: true,
        meta: {
          changes: Number(result.meta?.changes ?? 0),
          last_row_id: Number(result.meta?.last_row_id ?? 0),
        },
        results: (result.results ?? []) as T[],
      }));
    },
    exec: db.exec ? async (query: string) => db.exec!(query) : undefined,
    prepare(query: string): FluentPreparedStatement {
      return wrapCloudflarePreparedStatement(db.prepare(query));
    },
  };
}

export function wrapCloudflarePreparedStatement(statement: D1PreparedStatement): FluentPreparedStatement {
  const wrapped: WrappedCloudflarePreparedStatement = {
    __rawD1PreparedStatement: statement,
    all<T = unknown>() {
      return statement.all<T>();
    },
    bind(...values: unknown[]): FluentPreparedStatement {
      return wrapCloudflarePreparedStatement(statement.bind(...values));
    },
    first<T = unknown>(columnName?: string) {
      return columnName ? statement.first<T>(columnName) : statement.first<T>();
    },
    async run<T = unknown>() {
      const result = await statement.run<T>();
      return {
        success: true,
        meta: {
          changes: Number(result.meta?.changes ?? 0),
          last_row_id: Number(result.meta?.last_row_id ?? 0),
        },
        results: (result.results ?? []) as T[],
      };
    },
  };

  return wrapped;
}

export function wrapCloudflareBlobStore(bucket: R2Bucket): FluentBlobStore {
  return {
    async delete(key: string): Promise<void> {
      await bucket.delete(key);
    },
    async get(key: string): Promise<FluentBlobObject | null> {
      const object = await bucket.get(key);
      return object ? wrapCloudflareBlobObject(object) : null;
    },
    async head(key: string): Promise<Omit<FluentBlobObject, 'arrayBuffer'> | null> {
      const object = await bucket.head(key);
      return object ? wrapCloudflareBlobHead(object) : null;
    },
    async put(key: string, body: BodyInit | null, options?: FluentBlobStorePutOptions): Promise<void> {
      await bucket.put(key, await normalizeCloudflareBlobBody(body), {
        customMetadata: options?.customMetadata,
        httpMetadata: toCloudflareHttpMetadata(options?.httpMetadata),
      });
    },
  };
}

function wrapCloudflareBlobObject(object: R2ObjectBody): FluentBlobObject {
  return {
    arrayBuffer: () => object.arrayBuffer(),
    customMetadata: object.customMetadata,
    httpMetadata: toFluentHttpMetadata(object.httpMetadata),
    key: object.key,
    size: object.size,
    uploaded: object.uploaded,
  };
}

function wrapCloudflareBlobHead(object: R2Object): Omit<FluentBlobObject, 'arrayBuffer'> {
  return {
    customMetadata: object.customMetadata,
    httpMetadata: toFluentHttpMetadata(object.httpMetadata),
    key: object.key,
    size: object.size,
    uploaded: object.uploaded,
  };
}

function toD1PreparedStatement(statement: FluentPreparedStatement): D1PreparedStatement {
  const wrapped = statement as Partial<WrappedCloudflarePreparedStatement>;
  return wrapped.__rawD1PreparedStatement ?? (statement as D1PreparedStatement);
}

function toCloudflareHttpMetadata(metadata: FluentBlobHttpMetadata | undefined): R2HTTPMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  return {
    cacheControl: metadata.cacheControl,
    cacheExpiry:
      typeof metadata.cacheExpiry === 'string'
        ? new Date(metadata.cacheExpiry)
        : undefined,
    contentDisposition: metadata.contentDisposition,
    contentEncoding: metadata.contentEncoding,
    contentLanguage: metadata.contentLanguage,
    contentType: metadata.contentType,
  };
}

function toFluentHttpMetadata(metadata: R2HTTPMetadata | undefined): FluentBlobHttpMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  return {
    cacheControl: metadata.cacheControl,
    cacheExpiry: metadata.cacheExpiry?.toISOString(),
    contentDisposition: metadata.contentDisposition,
    contentEncoding: metadata.contentEncoding,
    contentLanguage: metadata.contentLanguage,
    contentType: metadata.contentType,
  };
}

async function normalizeCloudflareBlobBody(
  value: BodyInit | null,
): Promise<string | ArrayBuffer | ArrayBufferView | Blob | ReadableStream | null> {
  if (value == null || typeof value === 'string' || value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Blob || value instanceof ReadableStream) {
    return value;
  }
  return await new Response(value).arrayBuffer();
}
