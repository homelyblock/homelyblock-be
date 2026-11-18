import { describe, expect, it } from 'vitest';
import {
  attachmentContentDisposition,
  checkComplaintImage,
  safeAttachmentFilename,
} from './image-signature.js';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

function webp(): Buffer {
  const bytes = Buffer.alloc(12);
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WEBP', 8, 'ascii');
  return bytes;
}

describe('complaint image checks', () => {
  it('accepts matching JPEG, PNG, and WebP files', () => {
    expect(
      checkComplaintImage({
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: JPEG,
      }),
    ).toEqual({ ok: true, contentType: 'image/jpeg', filename: 'photo.jpg' });
    expect(
      checkComplaintImage({
        originalname: 'scratch.PNG',
        mimetype: 'image/png',
        buffer: PNG,
      }).ok,
    ).toBe(true);
    expect(
      checkComplaintImage({
        originalname: 'gate.webp',
        mimetype: 'image/webp',
        buffer: webp(),
      }).ok,
    ).toBe(true);
  });

  it('rejects a browser MIME type that does not match the bytes', () => {
    const result = checkComplaintImage({
      originalname: 'scratch.png',
      mimetype: 'image/png',
      buffer: Buffer.from('<html></html>'),
    });
    expect(result).toEqual({ ok: false, reason: 'signature' });

    expect(
      checkComplaintImage({
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: PNG,
      }),
    ).toEqual({ ok: false, reason: 'mime' });
  });

  it('rejects an extension that does not match the signature', () => {
    expect(
      checkComplaintImage({
        originalname: 'photo.png',
        mimetype: 'image/jpeg',
        buffer: JPEG,
      }),
    ).toEqual({ ok: false, reason: 'extension' });
    expect(
      checkComplaintImage({
        originalname: 'photo.txt',
        mimetype: 'image/jpeg',
        buffer: JPEG,
      }),
    ).toEqual({ ok: false, reason: 'extension' });
  });

  it('removes header and path characters from download names', () => {
    expect(safeAttachmentFilename('scratch.png\r\nX-Evil: yes')).toBe(
      'scratch.pngX-Evil: yes',
    );
    expect(safeAttachmentFilename('../../etc/passwd.png')).toBe(
      '____etc_passwd.png',
    );
    const header = attachmentContentDisposition('bill.png\r\nSet-Cookie: x');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.startsWith('attachment; filename="')).toBe(true);
  });
});
