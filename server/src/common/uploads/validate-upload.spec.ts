import { validateUpload } from './validate-upload';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(100)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(100)]);

describe('validateUpload', () => {
  it('accepts real jpeg/png/webp/pdf', () => {
    expect(validateUpload({ buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length }).ext).toBe('jpg');
    expect(validateUpload({ buffer: png, mimetype: 'image/png', size: png.length }).ext).toBe('png');
    expect(validateUpload({ buffer: webp, mimetype: 'image/webp', size: webp.length }).ext).toBe('webp');
    expect(validateUpload({ buffer: pdf, mimetype: 'application/pdf', size: pdf.length }).mime).toBe('application/pdf');
  });

  it('rejects a file whose bytes do not match its declared type (exe renamed .jpg)', () => {
    expect(() => validateUpload({ buffer: Buffer.from('MZ....'), mimetype: 'image/jpeg', size: 6 })).toThrow();
  });

  it('rejects a real png declared as jpeg', () => {
    expect(() => validateUpload({ buffer: png, mimetype: 'image/jpeg', size: png.length })).toThrow();
  });

  it('rejects files over 5 MB', () => {
    expect(() => validateUpload({ buffer: jpeg, mimetype: 'image/jpeg', size: 6 * 1024 * 1024 })).toThrow();
  });

  it('rejects an empty file', () => {
    expect(() => validateUpload({ buffer: Buffer.alloc(0), mimetype: 'image/jpeg', size: 0 })).toThrow();
  });

  it('rejects a PDF when only images are allowed, with a photo-specific message', () => {
    try {
      validateUpload({ buffer: pdf, mimetype: 'application/pdf', size: pdf.length }, { imagesOnly: true });
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getStatus()).toBe(400);
      expect(e.getResponse().message).toBe('Please upload a photo (JPG, PNG or WEBP).');
    }
  });

  it('uses a friendly message and INVALID_FILE code for bad types', () => {
    try {
      validateUpload({ buffer: Buffer.from('hello'), mimetype: 'text/plain', size: 5 });
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse()).toMatchObject({
        message: 'Only JPG, PNG, WEBP or PDF files up to 5 MB are allowed.',
        code: 'INVALID_FILE',
      });
    }
  });
});
