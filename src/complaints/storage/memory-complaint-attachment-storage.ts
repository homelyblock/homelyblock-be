import { Injectable, NotFoundException } from '@nestjs/common';
import type { ComplaintAttachmentStorage } from './complaint-attachment-storage.js';

@Injectable()
export class MemoryComplaintAttachmentStorage
  implements ComplaintAttachmentStorage
{
  readonly enabled = true;
  readonly mode = 'memory' as const;
  private readonly files = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<void> {
    this.files.set(key, Buffer.from(data));
  }

  async get(key: string): Promise<Buffer> {
    const data = this.files.get(key);
    if (!data) {
      throw new NotFoundException({
        message: 'Attachment file not found',
        code: 'NOT_FOUND',
      });
    }
    return Buffer.from(data);
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }

  clear(): void {
    this.files.clear();
  }
}
