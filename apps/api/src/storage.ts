import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from './config.js';

/** Private object storage for uploaded documents. */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Time-limited download URL that opens the file inline with its original name. */
  signedUrl(
    key: string,
    fileName: string,
    contentType: string,
    ttlSeconds?: number,
  ): Promise<string>;
  delete(key: string): Promise<void>;
  /** Creates the bucket if needed (development convenience). */
  ensureReady(): Promise<void>;
}

const DOWNLOAD_TTL = 5 * 60;

const disposition = (fileName: string) =>
  `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`;

class S3Storage implements Storage {
  private client: S3Client;
  private signer: S3Client;

  constructor(private env: Env) {
    const base = {
      region: env.S3_REGION,
      forcePathStyle: true, // MinIO and most S3-compatible services
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    };
    this.client = new S3Client({
      ...base,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    });
    const publicEndpoint = env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT;
    this.signer = new S3Client({
      ...base,
      ...(publicEndpoint ? { endpoint: publicEndpoint } : {}),
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  signedUrl(key: string, fileName: string, contentType: string, ttlSeconds = DOWNLOAD_TTL) {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        ResponseContentDisposition: disposition(fileName),
        ResponseContentType: contentType,
      }),
      { expiresIn: ttlSeconds },
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
  }

  async ensureReady() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.env.S3_BUCKET }));
    }
  }
}

/** For tests: keeps files in memory and returns fake URLs. */
export class MemoryStorage implements Storage {
  files = new Map<string, { body: Buffer; contentType: string }>();
  async put(key: string, body: Buffer, contentType: string) {
    this.files.set(key, { body, contentType });
  }
  async signedUrl(key: string, fileName: string) {
    return `memory://${key}?name=${encodeURIComponent(fileName)}`;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  async ensureReady() {}
}

export function createStorage(env: Env): Storage {
  return env.STORAGE_DRIVER === 'memory' ? new MemoryStorage() : new S3Storage(env);
}
