import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { PartnerDocumentsService } from './partner-documents.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService } from '../../common/moderation/moderation.service';

jest.mock('./storage', () => ({
  writePartnerDocumentFile: jest.fn().mockReturnValue('doc_generated456.jpg'),
  deleteUploadedPartnerDocumentFile: jest.fn(),
}));

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('fake-bytes'),
    originalname: 'menu-photo.jpg',
    mimetype: 'image/jpeg',
    fieldname: 'file',
    encoding: '7bit',
    size: 10,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

describe('PartnerDocumentsService.upload — moderation', () => {
  let moderation: { checkImage: jest.Mock };
  let db: any;
  let service: PartnerDocumentsService;

  beforeEach(async () => {
    moderation = { checkImage: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([
        {
          id: 'doc_1', partnerId: 'u_1', partnerType: 'restaurant', type: 'business_license',
          fileUrl: '/uploads/partner-documents/doc_generated456.jpg',
          fileName: 'menu-photo.jpg', status: 'PENDING', reviewNote: null, updatedAt: new Date(),
        },
      ]),
    };

    const module = await Test.createTestingModule({
      providers: [
        PartnerDocumentsService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: ModerationService, useValue: moderation },
      ],
    }).compile();
    service = module.get(PartnerDocumentsService);
  });

  it('rejects the upload when moderation flags the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: false, reasons: ['Explicit Nudity (92.3%)'] });
    await expect(
      service.upload('u_1', 'restaurant', 'business_license', makeFile()),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects the upload when the moderation call itself fails (fail closed)', async () => {
    moderation.checkImage.mockRejectedValue(new Error('AWS unavailable'));
    await expect(
      service.upload('u_1', 'restaurant', 'business_license', makeFile()),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('accepts the upload when moderation allows the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: true, reasons: [] });
    const result = await service.upload('u_1', 'restaurant', 'business_license', makeFile());
    expect(result.status).toBe('PENDING');
  });

  it('does not call moderation for PDF uploads', async () => {
    const result = await service.upload(
      'u_1', 'restaurant', 'business_license',
      makeFile({ mimetype: 'application/pdf', originalname: 'license.pdf' }),
    );
    expect(moderation.checkImage).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
  });
});
