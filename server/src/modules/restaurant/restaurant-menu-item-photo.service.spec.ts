import { Test } from '@nestjs/testing';
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

describe('RestaurantService — menu item photo', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: RestaurantService;
  let restaurantRow: { id: string; partnerId: string };
  let itemRow: { id: string; restaurantId: string; photo: string | null; price: string };

  beforeEach(async () => {
    restaurantRow = { id: 'rst_1', partnerId: 'u_1' };
    itemRow = { id: 'mi_1', restaurantId: 'rst_1', photo: null, price: '250.00' };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/dish.jpg', publicId: 'zamzam-restaurant-menu-item/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };

    // assertOwnedMenuItem() calls assertOwnedRestaurant() first (1st .limit()
    // call resolves the restaurant row), then selects the item (2nd call).
    let limitCallCount = 0;
    let pendingSet: Partial<typeof itemRow> = {};
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        limitCallCount += 1;
        return Promise.resolve(limitCallCount % 2 === 1 ? [restaurantRow] : [itemRow]);
      }),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockImplementation((payload) => {
        pendingSet = payload;
        return db;
      }),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...itemRow, ...pendingSet }])),
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

  it('uploads and sets the menu item photo', async () => {
    const result = await service.setMenuItemPhoto('u_1', 'rst_1', 'mi_1', makeFile());
    expect(db.set).toHaveBeenCalledWith({ photo: 'https://cdn/dish.jpg' });
    expect(result.photo).toBe('https://cdn/dish.jpg');
    expect(cloudinary.deleteImage).not.toHaveBeenCalled();
  });

  it('deletes the old Cloudinary asset when replacing an existing photo', async () => {
    itemRow.photo = 'https://cdn/old.jpg';
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-restaurant-menu-item/old');
    await service.setMenuItemPhoto('u_1', 'rst_1', 'mi_1', makeFile());
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-restaurant-menu-item/old');
  });

  it('clears the photo field and deletes the Cloudinary asset on delete', async () => {
    itemRow.photo = 'https://cdn/dish.jpg';
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-restaurant-menu-item/x');
    const result = await service.deleteMenuItemPhoto('u_1', 'rst_1', 'mi_1');
    expect(db.set).toHaveBeenCalledWith({ photo: null });
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-restaurant-menu-item/x');
    expect(result.photo).toBeNull();
  });
});
