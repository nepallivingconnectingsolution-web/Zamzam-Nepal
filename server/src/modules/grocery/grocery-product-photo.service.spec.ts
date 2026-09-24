import { Test } from '@nestjs/testing';
import { GroceryService } from './grocery.service';
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

describe('GroceryService — product photo', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: GroceryService;
  let storeRow: { id: string; partnerId: string };
  let productRow: { id: string; storeId: string; photo: string | null; price: string; mrp: string | null };

  beforeEach(async () => {
    storeRow = { id: 'gst_1', partnerId: 'u_1' };
    productRow = { id: 'prd_1', storeId: 'gst_1', photo: null, price: '100.00', mrp: null };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/prd.jpg', publicId: 'zamzam-grocery-product/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };

    // assertOwnedProduct() calls assertOwnedStore() first (1st .limit() call
    // resolves the store row), then selects the product itself (2nd call).
    let limitCallCount = 0;
    let pendingSet: Partial<typeof productRow> = {};
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        limitCallCount += 1;
        return Promise.resolve(limitCallCount % 2 === 1 ? [storeRow] : [productRow]);
      }),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockImplementation((payload) => {
        pendingSet = payload;
        return db;
      }),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...productRow, ...pendingSet }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        GroceryService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyUser: jest.fn() } },
        { provide: PartnerDocumentsService, useValue: { assertRequiredDocsUploaded: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(GroceryService);
  });

  it('uploads and sets the product photo', async () => {
    const result = await service.setProductPhoto('u_1', 'gst_1', 'prd_1', makeFile());
    expect(db.set).toHaveBeenCalledWith({ photo: 'https://cdn/prd.jpg' });
    expect(result.photo).toBe('https://cdn/prd.jpg');
    expect(cloudinary.deleteImage).not.toHaveBeenCalled();
  });

  it('deletes the old Cloudinary asset when replacing an existing photo', async () => {
    productRow.photo = 'https://cdn/old.jpg';
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-grocery-product/old');
    await service.setProductPhoto('u_1', 'gst_1', 'prd_1', makeFile());
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-grocery-product/old');
  });

  it('clears the photo field and deletes the Cloudinary asset on delete', async () => {
    productRow.photo = 'https://cdn/prd.jpg';
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-grocery-product/x');
    const result = await service.deleteProductPhoto('u_1', 'gst_1', 'prd_1');
    expect(db.set).toHaveBeenCalledWith({ photo: null });
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-grocery-product/x');
    expect(result.photo).toBeNull();
  });
});
