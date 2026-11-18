import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ComplaintAttachmentStorage } from './complaint-attachment-storage.js';

@Injectable()
export class LocalComplaintAttachmentStorage
  implements ComplaintAttachmentStorage
{
  readonly enabled = true;
  readonly mode = 'local' as const;

  constructor(private readonly rootDir: string) {
    if (!rootDir || rootDir.trim().length === 0) {
      throw new Error('COMPLAINT_ATTACHMENT_DIR is required for local storage');
    }
    mkdirSync(rootDir, { recursive: true });
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolvePath(key);
    mkdirSync(path.dirname(target), { recursive: true });
    await pipeline(Readable.from(data), createWriteStream(target));
  }

  async get(key: string): Promise<Buffer> {
    const target = this.resolvePath(key);
    if (!existsSync(target)) {
      throw new NotFoundException({
        message: 'Attachment file not found',
        code: 'NOT_FOUND',
      });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of createReadStream(target)) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    const target = this.resolvePath(key);
    if (!existsSync(target)) return;
    await unlink(target);
  }

  private resolvePath(key: string): string {
    if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
      throw new ServiceUnavailableException({
        message: 'Invalid attachment storage key',
        code: 'INVALID_STORAGE_KEY',
      });
    }
    return path.join(this.rootDir, key);
  }
}
