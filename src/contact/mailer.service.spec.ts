import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service.js';

const inquiry = {
  id: 'inquiry-1',
  fullName: 'Asha Menon',
  email: 'asha@example.com',
  subject: 'Society onboarding',
  message: 'Please tell me how a society administrator gets started.',
  societyName: 'Palm Court',
};

describe('MailerService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the email API when delivery is not configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const mailer = new MailerService(
      new ConfigService({}),
    );

    await expect(mailer.notifyInquiry(inquiry)).resolves.toEqual({
      emailed: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a support notice and a sender confirmation when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const mailer = new MailerService(
      new ConfigService({
        SUPPORT_EMAIL: 'support@example.com',
        MAIL_FROM: 'mail@example.com',
        RESEND_API_KEY: 're_test_key',
      }),
    );

    await expect(mailer.notifyInquiry(inquiry)).resolves.toEqual({
      emailed: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(first.headers).toMatchObject({
      Authorization: 'Bearer re_test_key',
    });
    if (typeof first.body !== 'string') {
      throw new Error('Expected a string email body');
    }
    const body = JSON.parse(first.body) as { to: string[] };
    expect(body.to).toEqual(['support@example.com']);
  });

  it('reports incomplete delivery when the provider rejects the message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422 }),
    );
    const mailer = new MailerService(
      new ConfigService({
        SUPPORT_EMAIL: 'support@example.com',
        MAIL_FROM: 'mail@example.com',
        RESEND_API_KEY: 're_test_key',
      }),
    );

    await expect(mailer.notifyInquiry(inquiry)).resolves.toEqual({
      emailed: false,
    });
  });
});