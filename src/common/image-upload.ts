import { BadRequestException } from '@nestjs/common';

const IMAGE_SIGNATURES = {
  'image/jpeg': (data: Buffer) =>
    data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  'image/png': (data: Buffer) =>
    data.length >= 8 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/webp': (data: Buffer) =>
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP',
} as const;

type SupportedImageMime = keyof typeof IMAGE_SIGNATURES;

export function validateBase64Image(input: {
  base64: string;
  mimeType: string | undefined;
  maxBytes: number;
  label: string;
}) {
  const mimeType = input.mimeType?.toLowerCase() as SupportedImageMime | undefined;
  if (!mimeType || !(mimeType in IMAGE_SIGNATURES)) {
    throw new BadRequestException(
      `${input.label} must be a JPEG, PNG, or WebP image`,
    );
  }

  const base64 = input.base64.replace(/\s/g, '');
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new BadRequestException(`${input.label} contains invalid base64 data`);
  }

  const data = Buffer.from(base64, 'base64');
  if (data.length > input.maxBytes) {
    throw new BadRequestException(`${input.label} is too large (max ~2.5 MB)`);
  }
  if (!IMAGE_SIGNATURES[mimeType](data)) {
    throw new BadRequestException(`${input.label} content does not match its MIME type`);
  }

  return { base64, mimeType };
}
