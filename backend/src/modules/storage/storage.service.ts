import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config, hasS3Storage, storageDriver } from '../../config/index.js';

/**
 * Storage abstraction for uploaded files (license/insurance photos, damage
 * photos, docs). Two interchangeable backends:
 *
 *   • s3    — any S3-compatible service (AWS S3, Cloudflare R2). Used in prod.
 *   • local — writes to disk under UPLOAD_DIR. Zero-config dev fallback.
 *
 * The rest of the app only depends on this interface, so swapping providers
 * (or adding new ones) never touches business logic.
 */
export interface StoredObject {
  key: string;
  sizeBytes: number;
}

export interface DownloadResult {
  /** For s3: a short-lived presigned URL the client is redirected to. */
  redirectUrl?: string;
  /** For local: a readable stream we pipe back to the client. */
  stream?: ReadStream;
  contentType?: string;
}

export interface StorageDriver {
  readonly name: 's3' | 'local';
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  getDownload(key: string, contentType?: string): Promise<DownloadResult>;
  getBytes(key: string): Promise<Buffer>;
}

// ── S3 / R2 driver ──────────────────────────────────────
class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: config.S3_REGION,
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID!,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.S3_BUCKET!,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, sizeBytes: body.byteLength };
  }

  async getDownload(key: string): Promise<DownloadResult> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: config.S3_BUCKET!, Key: key }),
      { expiresIn: config.DOWNLOAD_URL_TTL },
    );
    return { redirectUrl: url };
  }

  async getBytes(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: config.S3_BUCKET!, Key: key }),
    );
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
}

// ── Local-disk driver ───────────────────────────────────
class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;
  private root: string;

  constructor() {
    this.root = resolve(config.UPLOAD_DIR);
  }

  private pathFor(key: string): string {
    // Prevent path traversal — keys are app-generated but be defensive.
    const safe = key.replace(/\.\.[/\\]/g, '');
    return join(this.root, safe);
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<StoredObject> {
    const filePath = this.pathFor(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    const info = await stat(filePath);
    return { key, sizeBytes: info.size };
  }

  async getDownload(key: string, contentType?: string): Promise<DownloadResult> {
    const filePath = this.pathFor(key);
    return { stream: createReadStream(filePath), contentType };
  }

  async getBytes(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }
}

export const storage: StorageDriver = hasS3Storage
  ? new S3StorageDriver()
  : new LocalStorageDriver();

/**
 * Build a deterministic, tenant-scoped object key.
 * e.g. shops/<shopId>/submissions/<submissionId>/<attachmentId>-<file>
 */
export function buildStorageKey(params: {
  shopId: string;
  submissionId: string;
  attachmentId: string;
  fileName: string;
}): string {
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  return `shops/${params.shopId}/submissions/${params.submissionId}/${params.attachmentId}-${safeName}`;
}

export { storageDriver };









