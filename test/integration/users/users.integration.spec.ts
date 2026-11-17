import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { TEST_ENV } from '../helpers/constants.js';
import { authHeader, createTestApp, createUser, resetDatabase, signRawJwt } from '../helpers/app.js';

describe('Users (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/users/me', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/users/me').expect(401);
    });

    it('returns 401 for a malformed token', async () => {
      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });

    it('returns 401 for a token signed with another secret', async () => {
      const user = await createUser(prisma);
      const token = await signRawJwt({ sub: user.id, email: user.email }, 'attacker-secret');

      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('returns 401 for an expired token', async () => {
      const user = await createUser(prisma);
      const token = await signRawJwt(
        { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) - 60 },
        TEST_ENV.JWT_SECRET,
      );

      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('returns the profile from the database', async () => {
      const user = await createUser(prisma, { githubInstallationId: 55 });

      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', await authHeader(app, user))
        .expect(200);

      expect(res.body).toEqual({
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        createdAt: user.createdAt.toISOString(),
      });
    });

    it('returns 404 when the user was deleted after the token was issued', async () => {
      const user = await createUser(prisma);
      const header = await authHeader(app, user);
      await prisma.user.delete({ where: { id: user.id } });

      await request(app.getHttpServer()).get('/api/users/me').set('Authorization', header).expect(404);
    });
  });

  describe('POST /api/users', () => {
    it('creates a user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'new@test.dev', username: 'newbie' })
        .expect(201);

      expect(res.body).toMatchObject({ email: 'new@test.dev', username: 'newbie' });
      await expect(prisma.user.count()).resolves.toBe(1);
    });

    it('returns 409 for a duplicate email', async () => {
      await createUser(prisma, { email: 'taken@test.dev' });

      await request(app.getHttpServer()).post('/api/users').send({ email: 'taken@test.dev' }).expect(409);
    });

    it('returns 400 for invalid input', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .send({ email: 'nope', username: 'ab' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('email'), expect.stringContaining('username')]),
      );
    });
  });

  describe('GET /api/users/:id', () => {
    it('returns a user by id', async () => {
      const user = await createUser(prisma);

      const res = await request(app.getHttpServer()).get(`/api/users/${user.id}`).expect(200);

      expect(res.body.id).toBe(user.id);
    });
  });
});
