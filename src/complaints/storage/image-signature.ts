const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export type ImageKind = 'jpeg' | 'png' | 'webp';

const CONTENT_TYPE: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const EXTENSIONS: Record<ImageKind, readonly string[]> = {
  jpeg: ['.jpg', '.jpeg'],
  png: ['.png'],
  webp: ['.webp'],
};

/** Identify the image from its bytes. The browser MIME type is not used. */
export function detectImageSignature(bytes: Buffer): ImageKind | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpeg';
  }
  if (bytes.length >= PNG.length && bytes.subarray(0, PNG.length).equals(PNG)) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function declaredKind(mimetype: string): ImageKind | null {
  const value = mimetype.toLowerCase().split(';')[0]?.trim() ?? '';
  if (value === 'image/jpeg' || value === 'image/jpg' || value === 'image/pjpeg') {
    return 'jpeg';
  }
  if (value === 'image/png') return 'png';
  if (value === 'image/webp') return 'webp';
  return null;
}

/** Keep download names out of response headers and paths. */
export function safeAttachmentFilename(name: string): string {
  const cleaned = name
    .replace(/[\r\n";]/g, '')
    .replace(/\.\./g, '_')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, 200);
  return cleaned || 'image';
}

export function attachmentContentDisposition(filename: string): string {
  const safe = safeAttachmentFilename(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export type ComplaintImageCheck =
  | { ok: true; contentType: string; filename: string }
  | { ok: false; reason: 'signature' | 'mime' | 'extension' };

/**
 * Accept only a JPEG, PNG, or WebP whose bytes, declared type, and extension agree.
 */
export function checkComplaintImage(input: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}): ComplaintImageCheck {
  const detected = detectImageSignature(input.buffer);
  if (!detected) return { ok: false, reason: 'signature' };
  if (declaredKind(input.mimetype) !== detected) {
    return { ok: false, reason: 'mime' };
  }
  const filename = safeAttachmentFilename(input.originalname);
  const dot = filename.lastIndexOf('.');
  const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  if (!EXTENSIONS[detected].includes(extension)) {
    return { ok: false, reason: 'extension' };
  }
  return { ok: true, contentType: CONTENT_TYPE[detected], filename };
}
