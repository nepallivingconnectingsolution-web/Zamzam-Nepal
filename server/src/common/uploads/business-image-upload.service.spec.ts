import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { BusinessImageUploadService } from './business-image-upload.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ModerationService } from '../moderation/moderation.service';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

describe('BusinessImageUploadService', () => {
  let moderation: { checkImage: jest.Mock };
  let cloudinary: { uploadImage: jest.Mock };
  let service: BusinessImageUploadService;

  beforeEach(async () => {
    moderation = { checkImage: jest.fn() };
    cloudinary = { uploadImage: jest.fn().mockResolvedValue({ url: 'https://cdn/x', publicId: 'zamzam-hotel/x' }) };

    const module = await Test.createTestingModule({
      providers: [
        BusinessImageUploadService,
        { provide: CloudinaryService, useValue: cloudinary },
        { provide: ModerationService, useValue: moderation },
      ],
    }).compile();
    service = module.get(BusinessImageUploadService);
  });

  it('rejects a file whose bytes do not match a real image type', async () => {
    await expect(
      service.upload({ buffer: Buffer.from('not an image'), mimetype: 'image/jpeg', size: 12 }, 'hotel'),
    ).rejects.toThrow();
    expect(moderation.checkImage).not.toHaveBeenCalled();
  });

  it('rejects when moderation flags the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: false, reasons: ['Explicit Nudity (92%)'] });
    await expect(
      service.upload({ buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length }, 'hotel'),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(cloudinary.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects when the moderation call itself fails (fail closed)', async () => {
    moderation.checkImage.mockRejectedValue(new Error('AWS unavailable'));
    await expect(
      service.upload({ buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length }, 'hotel'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('uploads to Cloudinary once moderation allows it', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: true, reasons: [] });
    const result = await service.upload({ buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length }, 'hotel');
    expect(result).toEqual({ url: 'https://cdn/x', publicId: 'zamzam-hotel/x' });
    expect(cloudinary.uploadImage).toHaveBeenCalledWith(jpeg, 'hotel');
  });
});
