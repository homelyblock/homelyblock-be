import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ComplaintAttachmentStorage } from './complaint-attachment-storage.js';

@Injectable()
export class DisabledComplaintAttachmentStorage
  implements ComplaintAttachmentStorage
{
  readonly enabled = false;
  readonly mode = 'disabled' as const;

  async put(): Promise<void> {
    this.reject();
  }

  async get(): Promise<Buffer> {
    this.reject();
  }

  async delete(): Promise<void> {
    this.reject();
  }

  private reject(): never {
    throw new ServiceUnavailableException({
      message:
        'Complaint image storage is not configured. Set COMPLAINT_ATTACHMENT_STORAGE=local and COMPLAINT_ATTACHMENT_DIR to enable secure uploads.',
      code: 'ATTACHMENT_STORAGE_DISABLED',
    });
  }
}
