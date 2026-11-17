import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../../src/auth/auth.service.js';
import type { RefreshTokenService } from '../../../src/auth/refresh-token.service.js';
import { createPrismaMock, type PrismaMock } from '../../helpers/prisma-mock.js';
import { makeGithubUser, makeUser } from '../../helpers/factories.js';

const JWT_SECRET = 'unit-test-secret';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwtService: JwtService;
  let refreshTokens: {
    create: ReturnType<typeof vi.fn>;
    findValidToken: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    const mocks = createPrismaMock();
    prisma = mocks.mock;
    jwtService = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } });
    refreshTokens = {
      create: vi.fn().mockResolvedValue('new-refresh-token'),
      findValidToken: vi.fn(),
      revoke: vi.fn(),
    };

    service = new AuthService(
      mocks.prisma,
      jwtService,
      refreshTokens as unknown as RefreshTokenService,
    );
  });

  describe('validateGithubUser', () => {
    it('updates profile of an existing user found by githubId', async () => {
      const existing = makeUser();
      const githubUser = makeGithubUser({ username: 'renamed', avatarUrl: 'new.png' });
      prisma.user.findUnique.mockResolvedValueOnce(existing);
      prisma.user.update.mockResolvedValue({ ...existing, githubUsername: 'renamed' });

      const result = await service.validateGithubUser(githubUser);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { githubId: githubUser.githubId } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { githubUsername: 'renamed', avatarUrl: 'new.png' },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result.githubUsername).toBe('renamed');
    });

    it('links GitHub account to an existing user with the same email', async () => {
      const byEmail = makeUser({ id: 'email-user', githubId: null, githubUsername: null });
      const githubUser = makeGithubUser();
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // by githubId
        .mockResolvedValueOnce(byEmail); // by email

      await service.validateGithubUser(githubUser);

      expect(prisma.user.findUnique).toHaveBeenLastCalledWith({ where: { email: githubUser.email } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'email-user' },
        data: {
          githubId: githubUser.githubId,
          githubUsername: githubUser.username,
          avatarUrl: githubUser.avatarUrl,
        },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates a new user when nobody matches', async () => {
      const githubUser = makeGithubUser();
      prisma.user.findUnique.mockResolvedValue(null);

      await service.validateGithubUser(githubUser);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: githubUser.email,
          username: githubUser.username,
          avatarUrl: githubUser.avatarUrl,
          githubId: githubUser.githubId,
          githubUsername: githubUser.username,
        },
      });
    });

    it('uses a placeholder email when GitHub does not share one', async () => {
      const githubUser = makeGithubUser({ email: undefined, githubId: '42' });
      prisma.user.findUnique.mockResolvedValue(null);

      await service.validateGithubUser(githubUser);

      // без email не шукаємо користувача за email
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: '42@github.local' }),
      });
    });
  });

  describe('generateAccessToken', () => {
    it('signs a JWT with sub/email and module expiration', async () => {
      const token = await service.generateAccessToken({ id: 'user-1', email: 'a@b.c' });

      const payload = await jwtService.verifyAsync<{ sub: string; email: string; exp: number; iat: number }>(token);

      expect(payload.sub).toBe('user-1');
      expect(payload.email).toBe('a@b.c');
      expect(payload.exp - payload.iat).toBe(15 * 60);
    });
  });

  describe('issueTokens', () => {
    it('returns an access token and a fresh refresh token', async () => {
      const tokens = await service.issueTokens({ id: 'user-1', email: 'a@b.c' });

      expect(tokens.refreshToken).toBe('new-refresh-token');
      expect(refreshTokens.create).toHaveBeenCalledWith('user-1');
      await expect(jwtService.verifyAsync(tokens.accessToken)).resolves.toMatchObject({ sub: 'user-1' });
    });
  });

  describe('refreshTokens', () => {
    it('rejects an invalid or expired refresh token', async () => {
      refreshTokens.findValidToken.mockResolvedValue(null);

      await expect(service.refreshTokens('bad')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.revoke).not.toHaveBeenCalled();
      expect(refreshTokens.create).not.toHaveBeenCalled();
    });

    it('rejects when the token was already used by a concurrent request', async () => {
      refreshTokens.findValidToken.mockResolvedValue({ userId: 'user-1' });
      refreshTokens.revoke.mockResolvedValue(false);

      await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.create).not.toHaveBeenCalled();
    });

    it('rejects when the user no longer exists', async () => {
      refreshTokens.findValidToken.mockResolvedValue({ userId: 'ghost' });
      refreshTokens.revoke.mockResolvedValue(true);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.create).not.toHaveBeenCalled();
    });

    it('rotates: revokes the old token and issues a new pair', async () => {
      refreshTokens.findValidToken.mockResolvedValue({ userId: 'user-1' });
      refreshTokens.revoke.mockResolvedValue(true);
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const tokens = await service.refreshTokens('old-token');

      expect(refreshTokens.revoke).toHaveBeenCalledWith('old-token');
      expect(refreshTokens.create).toHaveBeenCalledWith('user-1');
      expect(tokens.refreshToken).toBe('new-refresh-token');
      expect(tokens.accessToken).toEqual(expect.any(String));
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      await service.logout('token');

      expect(refreshTokens.revoke).toHaveBeenCalledWith('token');
    });
  });
});
