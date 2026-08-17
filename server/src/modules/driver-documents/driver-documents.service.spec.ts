import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { DriverDocumentsService } from './driver-documents.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService } from '../../common/moderation/moderation.service';

jest.mock('./storage', () => ({
  writeDriverDocumentFile: jest.fn().mockReturnValue('doc_generated123.jpg'),
  deleteUploadedDocumentFile: jest.fn(),
}));

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('fake-bytes'),
    originalname: 'license.jpg',
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

describe('DriverDocumentsService.upload — moderation', () => {
  let moderation: { checkImage: jest.Mock };
  let db: any;
  let service: DriverDocumentsService;

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
          id: 'doc_1', driverId: 'u_1', type: 'license', fileUrl: '/uploads/driver-documents/doc_generated123.jpg',
          fileName: 'license.jpg', status: 'PENDING', reviewNote: null, updatedAt: new Date(),
        },
      ]),
      update: jest.fn().mockReturnThis(),
    };

    const module = await Test.createTestingModule({
      providers: [
        DriverDocumentsService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: ModerationService, useValue: moderation },
      ],
    }).compile();
    service = module.get(DriverDocumentsService);
  });

  it('rejects the upload when moderation flags the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: false, reasons: ['Explicit Nudity (92.3%)'] });

    await expect(service.upload('u_1', 'license', makeFile())).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects the upload when the moderation call itself fails (fail closed)', async () => {
    moderation.checkImage.mockRejectedValue(new Error('AWS unavailable'));

    await expect(service.upload('u_1', 'license', makeFile())).rejects.toThrow(UnprocessableEntityException);
  });

  it('accepts the upload when moderation allows the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: true, reasons: [] });

    const result = await service.upload('u_1', 'license', makeFile());
    expect(result.status).toBe('PENDING');
    expect(moderation.checkImage).toHaveBeenCalledWith(Buffer.from('fake-bytes'));
  });

  it('does not call moderation for PDF uploads', async () => {
    const result = await service.upload(
      'u_1', 'license',
      makeFile({ mimetype: 'application/pdf', originalname: 'license.pdf' }),
    );
    expect(moderation.checkImage).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
  });
});
