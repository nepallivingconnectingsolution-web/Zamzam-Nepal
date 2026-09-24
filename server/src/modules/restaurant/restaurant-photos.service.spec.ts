import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';
import { BusinessImageUploadService } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

function makeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', fieldname: 'files',
    encoding: '7bit', size: 1, stream: undefined as never, destination: '', filename: '', path: '',
  };
}

describe('RestaurantService — photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: RestaurantService;
  let restaurantRow: { id: string; partnerId: string; photos: string[] };

  beforeEach(async () => {
    restaurantRow = { id: 'rst_1', partnerId: 'u_1', photos: [] };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/rst.jpg', publicId: 'zamzam-restaurant/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([restaurantRow]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...restaurantRow }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        RestaurantService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyUser: jest.fn() } },
        { provide: PartnerDocumentsService, useValue: { assertRequiredDocsUploaded: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(RestaurantService);
  });

  it('rejects a non-owner from uploading photos', async () => {
    await expect(service.addRestaurantPhotos('someone_else', 'rst_1', [makeFile()])).rejects.toThrow(ForbiddenException);
  });

  it('appends uploaded photos to the restaurant', async () => {
    await service.addRestaurantPhotos('u_1', 'rst_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/rst.jpg'] });
  });

  it('rejects a batch that would exceed the 10-photo cap', async () => {
    restaurantRow.photos = new Array(9).fill('https://cdn/x.jpg');
    await expect(
      service.addRestaurantPhotos('u_1', 'rst_1', [makeFile(), makeFile()]),
    ).rejects.toThrow();
    expect(businessImages.upload).not.toHaveBeenCalled();
  });

  it('deletes the matching photo and calls Cloudinary cleanup', async () => {
    restaurantRow.photos = ['https://cdn/rst.jpg'];
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-restaurant/x');
    await service.deleteRestaurantPhoto('u_1', 'rst_1', 'zamzam-restaurant/x');
    expect(db.set).toHaveBeenCalledWith({ photos: [] });
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-restaurant/x');
  });
});
