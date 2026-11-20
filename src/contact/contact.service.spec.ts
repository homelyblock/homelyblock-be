import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContactService } from './contact.service.js';
import { CreateContactInquiryDto } from './dto/create-contact-inquiry.dto.js';
import type { MailerService } from './mailer.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const valid = {
  fullName: 'Asha Menon',
  email: 'asha@example.com',
  subject: 'Society onboarding',
  message: 'Please tell me how a society administrator gets started.',
  societyName: 'Palm Court',
  privacyAcknowledged: true,
};

describe('ContactService', () => {
  const create = vi.fn();
  const notifyInquiry = vi.fn();

  const service = new ContactService(
    { contactInquiry: { create } } as unknown as PrismaService,
    { notifyInquiry } as unknown as MailerService,
  );

  beforeEach(() => {
    create.mockReset();
    notifyInquiry.mockReset();
    create.mockResolvedValue({ id: 'inquiry-1' });
    notifyInquiry.mockResolvedValue({ emailed: false });
  });

  it('stores a valid inquiry and asks the mailer to notify', async () => {
    await expect(service.submit(valid)).resolves.toEqual({
      received: true,
      emailed: false,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        fullName: 'Asha Menon',
        email: 'asha@example.com',
        subject: 'Society onboarding',
        message: 'Please tell me how a society administrator gets started.',
        societyName: 'Palm Court',
        privacyAcknowledged: true,
      },
      select: { id: true },
    });
    expect(notifyInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inquiry-1', email: 'asha@example.com' }),
    );
  });

  it('does not store a submission that fills the honeypot', async () => {
    await service.submit({ ...valid, website: 'https://spam.example' });

    expect(create).not.toHaveBeenCalled();
    expect(notifyInquiry).not.toHaveBeenCalled();
  });

  it('keeps a stored inquiry when notification throws', async () => {
    notifyInquiry.mockRejectedValue(new Error('network down'));

    await expect(service.submit(valid)).resolves.toEqual({
      received: true,
      emailed: false,
    });
    expect(create).toHaveBeenCalledOnce();
  });
});

describe('CreateContactInquiryDto', () => {
  it('rejects a message without a privacy acknowledgement', async () => {
    const dto = plainToInstance(CreateContactInquiryDto, {
      ...valid,
      privacyAcknowledged: false,
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'privacyAcknowledged')).toBe(
      true,
    );
  });

  it('rejects an oversized message', async () => {
    const dto = plainToInstance(CreateContactInquiryDto, {
      ...valid,
      message: 'x'.repeat(4001),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'message')).toBe(true);
  });
});
