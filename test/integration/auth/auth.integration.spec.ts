import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { RefreshTokenService } from '../../../src/auth/refresh-token.service.js';
import type { GithubUser } from '../../../src/auth/types/github-user.type.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { makeGithubUser } from '../../helpers/factories.js';
import { createTestApp, createUser, resetDatabase } from '../helpers/app.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('Auth (integration)', () => {
  describe('GET /api/auth/github', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('redirects to GitHub OAuth with our client id and callback', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/github').expect(302);

      const location = new URL(res.headers.location as string);
      expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
      expect(location.searchParams.get('client_id')).toBe('test-client-id');
      expect(location.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/api/auth/github/callback',
      );
      expect(location.searchParams.get('scope')).toBe('user:email');
    });
  });

  describe('with GitHub OAuth stubbed', () => {
    let app: NestExpressApplication;
    let prisma: PrismaService;
    let refreshTokenService: RefreshTokenService;
    // профіль, який "поверне GitHub" в наступному callback
    let githubProfile: GithubUser;

    const fakeGithubGuard = {
      canActivate: (context: ExecutionContext) => {
        context.switchToHttp().getRequest<{ user: GithubUser }>().user = githubProfile;
        return true;
      },
    };

    const callback = async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/github/callback').expect(302);
      const [target, fragment] = (res.headers.location as string).split('#');
      const params = new URLSearchParams(fragment);

      return {
        target,
        accessToken: params.get('accessToken') as string,
        refreshToken: params.get('refreshToken') as string,
      };
    };

    const refresh = (refreshToken: unknown) =>
      request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken });

    beforeAll(async () => {
      app = await createTestApp((builder) =>
        builder.overrideGuard(AuthGuard('github')).useValue(fakeGithubGuard),
      );
      prisma = app.get(PrismaService);
      refreshTokenService = app.get(RefreshTokenService);
    });

    beforeEach(async () => {
      await resetDatabase(prisma);
      githubProfile = makeGithubUser();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('GET /api/auth/github/callback', () => {
      it('creates the user and redirects to the first FRONTEND_URL with tokens', async () => {
        const { target, accessToken, refreshToken } = await callback();

        expect(target).toBe('http://localhost:5173/auth/callback');
        expect(accessToken).toBeTruthy();
        expect(refreshToken).toMatch(/^[0-9a-f]{128}$/);

        const users = await prisma.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0]).toMatchObject({
          email: githubProfile.email,
          githubId: githubProfile.githubId,
          githubUsername: githubProfile.username,
          avatarUrl: githubProfile.avatarUrl,
        });

        // у БД лежить тільки хеш refresh token
        const stored = await prisma.refreshToken.findMany();
        expect(stored).toHaveLength(1);
        expect(stored[0].tokenHash).toBe(sha256(refreshToken));
        expect(stored[0].userId).toBe(users[0].id);
      });

      it('issues an access token that works for protected endpoints', async () => {
        const { accessToken } = await callback();

        const me = await request(app.getHttpServer())
          .get('/api/users/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(me.body.githubUsername).toBe(githubProfile.username);
      });

      it('does not duplicate a returning user and refreshes their profile', async () => {
        await callback();
        githubProfile = makeGithubUser({ username: 'renamed', avatarUrl: 'https://new.png' });

        await callback();

        const users = await prisma.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0]).toMatchObject({ githubUsername: 'renamed', avatarUrl: 'https://new.png' });
      });

      it('links GitHub to an existing account with the same email', async () => {
        const existing = await createUser(prisma, {
          email: githubProfile.email,
          githubId: null,
          githubUsername: null,
        });

        await callback();

        const users = await prisma.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0]).toMatchObject({ id: existing.id, githubId: githubProfile.githubId });
      });

      it('creates a placeholder email when GitHub hides the email', async () => {
        githubProfile = makeGithubUser({ email: undefined, githubId: '777' });

        await callback();

        const user = await prisma.user.findFirstOrThrow();
        expect(user.email).toBe('777@github.local');
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('rotates tokens: new pair works, the old refresh token is revoked', async () => {
        const first = await callback();

        const res = await refresh(first.refreshToken).expect(200);

        expect(res.body).toEqual({
          accessToken: expect.any(String),
          refreshToken: expect.stringMatching(/^[0-9a-f]{128}$/),
        });
        expect(res.body.refreshToken).not.toBe(first.refreshToken);

        const old = await prisma.refreshToken.findUniqueOrThrow({
          where: { tokenHash: sha256(first.refreshToken) },
        });
        expect(old.revokedAt).not.toBeNull();

        await refresh(first.refreshToken).expect(401);
        await refresh(res.body.refreshToken).expect(200);
      });

      it('only one of two concurrent refreshes with the same token succeeds', async () => {
        const { refreshToken } = await callback();

        const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);

        expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
      });

      it('rejects an unknown token', async () => {
        const res = await refresh('f'.repeat(128)).expect(401);

        expect(res.body.message).toBe('Invalid or expired refresh token');
      });

      it('rejects an expired token', async () => {
        const user = await createUser(prisma);
        const token = await refreshTokenService.create(user.id);
        await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

        await refresh(token).expect(401);
      });

      it('rejects tokens of a deleted user', async () => {
        const user = await createUser(prisma);
        const token = await refreshTokenService.create(user.id);
        // каскадне видалення забирає і токени
        await prisma.user.delete({ where: { id: user.id } });

        await refresh(token).expect(401);
      });

      it.each([
        ['missing token', {}],
        ['too short token', { refreshToken: 'short' }],
        ['non-string token', { refreshToken: 123 }],
      ])('returns 400 for %s', async (_case, body) => {
        await request(app.getHttpServer()).post('/api/auth/refresh').send(body).expect(400);
      });

      it('returns 400 for unknown body fields', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: 'x'.repeat(40), admin: true })
          .expect(400);
      });
    });

    describe('POST /api/auth/logout', () => {
      it('revokes the refresh token', async () => {
        const { refreshToken } = await callback();

        await request(app.getHttpServer())
          .post('/api/auth/logout')
          .send({ refreshToken })
          .expect(200, { success: true });

        await refresh(refreshToken).expect(401);
      });

      it('is idempotent for unknown tokens', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/logout')
          .send({ refreshToken: 'f'.repeat(128) })
          .expect(200, { success: true });
      });
    });
  });
});
