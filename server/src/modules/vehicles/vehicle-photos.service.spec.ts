import { Test } from '@nestjs/testing';
import { VehiclesService } from './vehicles.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { BusinessImageUploadService } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

function makeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', fieldname: 'files',
    encoding: '7bit', size: 1, stream: undefined as never, destination: '', filename: '', path: '',
  };
}

describe('VehiclesService — photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: VehiclesService;
  let vehicleRow: {
    id: string; driverId: string; isActive: boolean; photos: string[]; photoRef: string | null;
    category: string; createdAt: Date;
  };

  beforeEach(async () => {
    vehicleRow = {
      id: 'veh_1', driverId: 'u_1', isActive: true, photos: [], photoRef: null,
      category: 'car', createdAt: new Date(),
    };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/veh.jpg', publicId: 'zamzam-vehicle/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };
    let pendingSet: Partial<typeof vehicleRow> = {};
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([vehicleRow]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockImplementation((payload) => {
        pendingSet = payload;
        return db;
      }),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...vehicleRow, ...pendingSet }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        VehiclesService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(VehiclesService);
  });

  it('appends uploaded photos and returns them in the DTO', async () => {
    const result = await service.addVehiclePhotos('u_1', 'veh_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/veh.jpg'], updatedAt: expect.any(Date) });
    expect(result.photos).toEqual(['https://cdn/veh.jpg']);
  });

  it('falls back to photoRef in the returned DTO once photos is empty again', async () => {
    vehicleRow.photos = ['https://cdn/veh.jpg'];
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-vehicle/x');
    // Simulates the post-delete DB row: photos is now empty, the legacy
    // photoRef is still set — toDto() should fall back to it.
    db.returning.mockResolvedValueOnce([{ ...vehicleRow, photos: [], photoRef: 'https://legacy/photo.jpg' }]);
    const result = await service.deleteVehiclePhoto('u_1', 'veh_1', 'zamzam-vehicle/x');
    expect(result.photos).toEqual(['https://legacy/photo.jpg']);
  });
});
