import { createHash } from 'node:crypto';
import { RefreshTokenService } from '../../../src/auth/refresh-token.service.js';
import { createPrismaMock, type PrismaMock } from '../../helpers/prisma-mock.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let prisma: PrismaMock;

  beforeEach(() => {
    const mocks = createPrismaMock();
    prisma = mocks.mock;
    service = new RefreshTokenService(mocks.prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('returns a random 128-char hex token', async () => {
      const first = await service.create('user-1');
      const second = await service.create('user-1');

      expect(first).toMatch(/^[0-9a-f]{128}$/);
      expect(second).not.toBe(first);
    });

    it('stores only the sha256 hash of the token, never the token itself', async () => {
      const token = await service.create('user-1');

      const { data } = prisma.refreshToken.create.mock.calls[0][0];

      expect(data.tokenHash).toBe(sha256(token));
      expect(data.tokenHash).not.toBe(token);
      expect(data.userId).toBe('user-1');
    });

    it('expires in 7 days', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

      await service.create('user-1');

      const { data } = prisma.refreshToken.create.mock.calls[0][0];
      expect(data.expiresAt).toEqual(new Date('2026-03-17T12:00:00Z'));
    });
  });

  describe('findValidToken', () => {
    const token = 'a'.repeat(128);
    const future = new Date(Date.now() + 60_000);

    it('looks the token up by its hash', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await service.findValidToken(token);

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256(token) },
      });
    });

    it('returns null when token does not exist', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.findValidToken(token)).resolves.toBeNull();
    });

    it('returns null when token is revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: new Date(),
        expiresAt: future,
      });

      await expect(service.findValidToken(token)).resolves.toBeNull();
    });

    it('returns null when token is expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.findValidToken(token)).resolves.toBeNull();
    });

    it('returns the stored token when it is active', async () => {
      const stored = { id: 'rt-1', userId: 'user-1', revokedAt: null, expiresAt: future };
      prisma.refreshToken.findUnique.mockResolvedValue(stored);

      await expect(service.findValidToken(token)).resolves.toBe(stored);
    });
  });

  describe('revoke', () => {
    it('revokes only a not-yet-revoked token and returns true', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.revoke('token')).resolves.toBe(true);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256('token'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('returns false when nothing was revoked (unknown or already revoked)', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.revoke('token')).resolves.toBe(false);
    });
  });
});
