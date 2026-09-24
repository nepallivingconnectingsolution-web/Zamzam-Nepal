import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  async function build(cloudinaryUrl: string | undefined) {
    const module = await Test.createTestingModule({
      providers: [
        CloudinaryService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(cloudinaryUrl) } },
      ],
    }).compile();
    return module.get(CloudinaryService);
  }

  it('is not configured when CLOUDINARY_URL is unset', async () => {
    const service = await build(undefined);
    expect(service.isConfigured()).toBe(false);
  });

  it('is configured when CLOUDINARY_URL is set', async () => {
    const service = await build('cloudinary://key:secret@demo');
    expect(service.isConfigured()).toBe(true);
  });

  it('rejects uploadImage when unconfigured', async () => {
    const service = await build(undefined);
    await expect(service.uploadImage(Buffer.from('x'), 'hotel')).rejects.toThrow();
  });

  it('publicIdFromUrl reverses the URL shape this service produces', async () => {
    const service = await build('cloudinary://key:secret@demo');
    const url = 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/zamzam-hotel/abc123';
    expect(service.publicIdFromUrl(url)).toBe('zamzam-hotel/abc123');
  });

  it('publicIdFromUrl returns null for a URL it did not generate', async () => {
    const service = await build('cloudinary://key:secret@demo');
    expect(service.publicIdFromUrl('https://example.com/photo.jpg')).toBeNull();
  });

  it('deleteImage on an unconfigured service resolves without throwing', async () => {
    const service = await build(undefined);
    await expect(service.deleteImage('whatever')).resolves.toBeUndefined();
  });
});
