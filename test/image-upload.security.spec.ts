import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateBase64Image } from '../src/common/image-upload.js';

const validate = (base64: string, mimeType: string) =>
  validateBase64Image({
    base64,
    mimeType,
    maxBytes: 32,
    label: 'Upload',
  });

describe('image upload validation', () => {
  it('accepts matching JPEG, PNG, and WebP signatures', () => {
    expect(validate('/9j/AA==', 'image/jpeg').mimeType).toBe('image/jpeg');
    expect(validate('iVBORw0KGgo=', 'image/png').mimeType).toBe('image/png');
    expect(validate('UklGRgAAAABXRUJQ', 'image/webp').mimeType).toBe('image/webp');
  });

  it('rejects SVG and HTML image MIME types', () => {
    const payload = Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64');
    expect(() => validate(payload, 'image/svg+xml')).toThrow(BadRequestException);
    expect(() => validate(payload, 'text/html')).toThrow(BadRequestException);
  });

  it('rejects spoofed MIME types and invalid base64', () => {
    const html = Buffer.from('<html>not an image</html>').toString('base64');
    expect(() => validate(html, 'image/png')).toThrow(BadRequestException);
    expect(() => validate('%%%not-base64%%%', 'image/jpeg')).toThrow(
      BadRequestException,
    );
  });

  it('rejects decoded payloads over the byte limit', () => {
    const oversizedJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(30),
    ]).toString('base64');
    expect(() => validate(oversizedJpeg, 'image/jpeg')).toThrow(
      BadRequestException,
    );
  });
});
