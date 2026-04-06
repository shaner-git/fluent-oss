import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FluentBlobHttpMetadata, FluentBlobStore } from '../storage';

interface StoredArtifactMetadata {
  customMetadata?: Record<string, string>;
  httpMetadata?: {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    cacheControl?: string;
    cacheExpiry?: string;
  };
  uploadedAt: string;
}

interface LocalArtifactObject {
  arrayBuffer(): Promise<ArrayBuffer>;
  customMetadata?: Record<string, string>;
  httpMetadata?: StoredArtifactMetadata['httpMetadata'];
  key: string;
  size: number;
  uploaded: Date;
}

export class LocalArtifactBucket implements FluentBlobStore {
  constructor(private readonly rootDir: string) {}

  async put(
    key: string,
    value: BodyInit | null,
    options?: {
      customMetadata?: Record<string, string>;
      httpMetadata?: FluentBlobHttpMetadata;
    },
  ): Promise<void> {
    const filePath = this.resolveArtifactPath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const bytes = await toUint8Array(value);
    await writeFile(filePath, bytes);
    await writeFile(
      this.resolveMetadataPath(key),
      JSON.stringify(
        {
          customMetadata: options?.customMetadata,
          httpMetadata: options?.httpMetadata,
          uploadedAt: new Date().toISOString(),
        } satisfies StoredArtifactMetadata,
        null,
        2,
      ),
      'utf8',
    );
  }

  async get(key: string): Promise<LocalArtifactObject | null> {
    const filePath = this.resolveArtifactPath(key);
    try {
      const [bytes, fileStat, metadata] = await Promise.all([
        readFile(filePath),
        stat(filePath),
        this.readMetadata(key),
      ]);
      return {
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        customMetadata: metadata?.customMetadata,
        httpMetadata: metadata?.httpMetadata,
        key,
        size: fileStat.size,
        uploaded: new Date(metadata?.uploadedAt ?? fileStat.mtime.toISOString()),
      };
    } catch {
      return null;
    }
  }

  async head(key: string): Promise<Omit<LocalArtifactObject, 'arrayBuffer'> | null> {
    const object = await this.get(key);
    if (!object) {
      return null;
    }
    return {
      customMetadata: object.customMetadata,
      httpMetadata: object.httpMetadata,
      key: object.key,
      size: object.size,
      uploaded: object.uploaded,
    };
  }

  async delete(key: string): Promise<void> {
    await Promise.allSettled([rm(this.resolveArtifactPath(key), { force: true }), rm(this.resolveMetadataPath(key), { force: true })]);
  }

  private resolveArtifactPath(key: string): string {
    return path.join(this.rootDir, ...key.split('/'));
  }

  private resolveMetadataPath(key: string): string {
    return `${this.resolveArtifactPath(key)}.meta.json`;
  }

  private async readMetadata(key: string): Promise<StoredArtifactMetadata | null> {
    try {
      const raw = await readFile(this.resolveMetadataPath(key), 'utf8');
      return JSON.parse(raw) as StoredArtifactMetadata;
    } catch {
      return null;
    }
  }
}

async function toUint8Array(value: BodyInit | null): Promise<Uint8Array> {
  if (value == null) {
    return new Uint8Array();
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  const response = new Response(value);
  return new Uint8Array(await response.arrayBuffer());
}
