import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { HotelService } from './hotel.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';
import { BusinessImageUploadService } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

function makeFile(name = 'a.jpg'): Express.Multer.File {
  return {
    buffer: Buffer.from('x'), originalname: name, mimetype: 'image/jpeg', fieldname: 'files',
    encoding: '7bit', size: 1, stream: undefined as never, destination: '', filename: '', path: '',
  };
}

describe('HotelService — photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: HotelService;
  let hotelRow: { id: string; partnerId: string; photos: string[] };

  beforeEach(async () => {
    hotelRow = { id: 'htl_1', partnerId: 'u_1', photos: ['https://cdn/existing.jpg'] };
    businessImages = { upload: jest.fn() };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([hotelRow]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...hotelRow }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        HotelService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: PartnerDocumentsService, useValue: { assertRequiredDocsUploaded: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(HotelService);
  });

  it('rejects a non-owner from uploading photos', async () => {
    await expect(service.addHotelPhotos('someone_else', 'htl_1', [makeFile()])).rejects.toThrow(ForbiddenException);
  });

  it('appends uploaded photo URLs to the existing array', async () => {
    businessImages.upload.mockResolvedValue({ url: 'https://cdn/new.jpg', publicId: 'zamzam-hotel/new' });
    await service.addHotelPhotos('u_1', 'htl_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/existing.jpg', 'https://cdn/new.jpg'] });
  });

  it('rejects a batch that would exceed the 10-photo cap', async () => {
    hotelRow.photos = new Array(9).fill('https://cdn/x.jpg');
    const files = [makeFile('a.jpg'), makeFile('b.jpg')];
    await expect(service.addHotelPhotos('u_1', 'htl_1', files)).rejects.toThrow();
    expect(businessImages.upload).not.toHaveBeenCalled();
  });

  it('deletes the matching photo and calls Cloudinary cleanup', async () => {
    cloudinary.publicIdFromUrl.mockImplementation((url: string) =>
      url === 'https://cdn/existing.jpg' ? 'zamzam-hotel/existing' : null,
    );
    await service.deleteHotelPhoto('u_1', 'htl_1', 'zamzam-hotel/existing');
    expect(db.set).toHaveBeenCalledWith({ photos: [] });
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-hotel/existing');
  });

  it('404s deleting a publicId that is not in the photos array', async () => {
    cloudinary.publicIdFromUrl.mockReturnValue('some-other-id');
    await expect(service.deleteHotelPhoto('u_1', 'htl_1', 'zamzam-hotel/missing')).rejects.toThrow();
  });
});
