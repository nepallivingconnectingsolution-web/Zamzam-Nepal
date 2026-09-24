import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { BusesService } from './buses.service';
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

describe('BusesService — photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: BusesService;
  let busRow: { id: string; operatorId: string; photos: string[] };

  beforeEach(async () => {
    busRow = { id: 'bus_1', operatorId: 'u_1', photos: [] };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/bus.jpg', publicId: 'zamzam-bus/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([busRow]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...busRow }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        BusesService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyUser: jest.fn() } },
        { provide: PartnerDocumentsService, useValue: { assertRequiredDocsUploaded: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(BusesService);
  });

  it('rejects a non-operator from uploading photos', async () => {
    await expect(service.addBusPhotos('someone_else', 'bus_1', [makeFile()])).rejects.toThrow(ForbiddenException);
  });

  it('appends uploaded photos to the bus', async () => {
    await service.addBusPhotos('u_1', 'bus_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/bus.jpg'] });
  });

  it('deletes the matching photo', async () => {
    busRow.photos = ['https://cdn/bus.jpg'];
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-bus/x');
    await service.deleteBusPhoto('u_1', 'bus_1', 'zamzam-bus/x');
    expect(db.set).toHaveBeenCalledWith({ photos: [] });
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-bus/x');
  });
});
