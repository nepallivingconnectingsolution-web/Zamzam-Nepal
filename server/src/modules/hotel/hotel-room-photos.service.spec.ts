import { Test } from '@nestjs/testing';
import { HotelService } from './hotel.service';
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

describe('HotelService — room type photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: HotelService;
  let hotelRow: { id: string; partnerId: string };
  let roomRow: { id: string; hotelId: string; photos: string[]; pricePerNight: string };

  beforeEach(async () => {
    hotelRow = { id: 'htl_1', partnerId: 'u_1' };
    roomRow = { id: 'rt_1', hotelId: 'htl_1', photos: [], pricePerNight: '1000.00' };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/room.jpg', publicId: 'zamzam-hotel-room/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };

    // assertOwnedRoomType() calls assertOwnedHotel() first (1st .limit() call
    // resolves the hotel row), then selects the room itself (2nd .limit()
    // call resolves the room row) — this counter mocks that call order.
    let limitCallCount = 0;
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        limitCallCount += 1;
        return Promise.resolve(limitCallCount === 1 ? [hotelRow] : [roomRow]);
      }),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...roomRow }])),
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

  it('appends uploaded photos to the room type', async () => {
    await service.addRoomTypePhotos('u_1', 'htl_1', 'rt_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/room.jpg'] });
    expect(businessImages.upload).toHaveBeenCalledWith(expect.anything(), 'hotel-room');
  });
});
