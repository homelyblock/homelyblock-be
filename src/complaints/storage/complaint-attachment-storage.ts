export const COMPLAINT_ATTACHMENT_STORAGE = Symbol(
  'COMPLAINT_ATTACHMENT_STORAGE',
);

export const ALLOWED_COMPLAINT_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_COMPLAINT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_COMPLAINT_ATTACHMENTS_PER_COMPLAINT = 5;

export type ComplaintAttachmentStorage = {
  readonly enabled: boolean;
  readonly mode: 'disabled' | 'local' | 'memory';
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
};
