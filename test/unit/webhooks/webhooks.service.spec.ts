import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { WebhooksService } from '../../../src/webhooks/webhooks.service.js';
import { createConfigMock } from '../../helpers/config-mock.js';
import { createPrismaMock, type PrismaMock } from '../../helpers/prisma-mock.js';

const SECRET = 'webhook-secret';
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('WebhooksService', () => {
  let prisma: PrismaMock;

  const createService = (env: Record<string, string | undefined> = { GITHUB_WEBHOOK_SECRET: SECRET }) => {
    const mocks = createPrismaMock();
    prisma = mocks.mock;
    return new WebhooksService(createConfigMock(env), mocks.prisma);
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('verifySignature', () => {
    const body = Buffer.from('{"zen":"Keep it simple"}');

    it('accepts a valid signature', () => {
      expect(() => createService().verifySignature(body, sign(body.toString()))).not.toThrow();
    });

    it.each([
      ['missing signature', body, undefined],
      ['missing raw body', undefined, sign(body.toString())],
      ['wrong secret', body, sign(body.toString(), 'other-secret')],
      ['tampered body', body, sign('{"zen":"changed"}')],
      ['malformed signature', body, 'sha256=short'],
    ])('rejects %s', (_case, rawBody, signature) => {
      expect(() => createService().verifySignature(rawBody, signature)).toThrow(UnauthorizedException);
    });

    it('skips the check without a secret outside production', () => {
      vi.stubEnv('NODE_ENV', 'development');

      expect(() => createService({}).verifySignature(body, undefined)).not.toThrow();
    });

    it('rejects everything without a secret in production', () => {
      vi.stubEnv('NODE_ENV', 'production');

      expect(() => createService({}).verifySignature(body, sign(body.toString()))).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('handleGithubWebhook', () => {
    it('answers ping', async () => {
      await expect(createService().handleGithubWebhook('ping', {})).resolves.toEqual({
        message: 'Github webhook is working',
      });
    });

    it('acknowledges unknown events', async () => {
      await expect(createService().handleGithubWebhook('star', {})).resolves.toEqual({
        message: 'Event star received',
      });
    });

    it('summarizes pull_request events', async () => {
      const result = await createService().handleGithubWebhook('pull_request', {
        action: 'opened',
        pull_request: { number: 5, title: 'Fix' },
        repository: { full_name: 'octocat/hello' },
      });

      expect(result).toEqual({
        message: 'Pull request webhook received',
        action: 'opened',
        repository: 'octocat/hello',
        pullRequest: 5,
      });
    });

    it('stores installation id for the account that installed the App', async () => {
      const service = createService();

      await service.handleGithubWebhook('installation', {
        action: 'created',
        installation: { id: 900, account: { id: 583231, login: 'octocat' } },
      });

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { githubId: '583231' },
        data: { githubInstallationId: 900 },
      });
    });

    it('clears installation id when the App is uninstalled', async () => {
      const service = createService();

      await service.handleGithubWebhook('installation', {
        action: 'deleted',
        installation: { id: 900, account: { id: 583231, login: 'octocat' } },
      });

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { githubInstallationId: 900 },
        data: { githubInstallationId: null },
      });
    });

    it('ignores other installation actions', async () => {
      const service = createService();

      await service.handleGithubWebhook('installation', {
        action: 'suspend',
        installation: { id: 900, account: null },
      });

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });
});
