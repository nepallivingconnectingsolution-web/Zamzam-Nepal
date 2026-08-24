import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import { ModerationService } from './moderation.service';

jest.mock('@aws-sdk/client-rekognition', () => {
  const actual = jest.requireActual('@aws-sdk/client-rekognition');
  return {
    ...actual,
    RekognitionClient: jest.fn(),
  };
});

describe('ModerationService', () => {
  const buffer = Buffer.from('fake-image-bytes');

  async function build(config: Record<string, string>) {
    const module = await Test.createTestingModule({
      providers: [
        ModerationService,
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
      ],
    }).compile();
    return module.get(ModerationService);
  }

  it('allows the image when AWS_REGION is not configured (local dev, no bypass of the rest of the app)', async () => {
    const service = await build({});
    const result = await service.checkImage(buffer);
    expect(result).toEqual({ allowed: true, reasons: [] });
    expect(RekognitionClient).not.toHaveBeenCalled();
  });

  it('allows the image when Rekognition returns no moderation labels', async () => {
    const send = jest.fn().mockResolvedValue({ ModerationLabels: [] });
    (RekognitionClient as jest.Mock).mockImplementation(() => ({ send }));

    const service = await build({ AWS_REGION: 'ap-south-1' });
    const result = await service.checkImage(buffer);

    expect(result).toEqual({ allowed: true, reasons: [] });
    expect(send).toHaveBeenCalledWith(expect.any(DetectModerationLabelsCommand));
  });

  it('rejects the image and lists reasons when Rekognition returns moderation labels', async () => {
    const send = jest.fn().mockResolvedValue({
      ModerationLabels: [{ Name: 'Explicit Nudity', Confidence: 92.3 }],
    });
    (RekognitionClient as jest.Mock).mockImplementation(() => ({ send }));

    const service = await build({ AWS_REGION: 'ap-south-1' });
    const result = await service.checkImage(buffer);

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(['Explicit Nudity (92.3%)']);
  });

  it('propagates an error when the Rekognition call itself fails (fail closed)', async () => {
    const send = jest.fn().mockRejectedValue(new Error('AWS unavailable'));
    (RekognitionClient as jest.Mock).mockImplementation(() => ({ send }));

    const service = await build({ AWS_REGION: 'ap-south-1' });
    await expect(service.checkImage(buffer)).rejects.toThrow('AWS unavailable');
  });

  it('passes the configured MinConfidence to Rekognition', async () => {
    const send = jest.fn().mockResolvedValue({ ModerationLabels: [] });
    (RekognitionClient as jest.Mock).mockImplementation(() => ({ send }));

    const service = await build({ AWS_REGION: 'ap-south-1', REKOGNITION_MIN_CONFIDENCE: '90' });
    await service.checkImage(buffer);

    const command = send.mock.calls[0][0] as DetectModerationLabelsCommand;
    expect(command.input.MinConfidence).toBe(90);
  });
});
