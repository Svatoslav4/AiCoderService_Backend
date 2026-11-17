import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Prisma, User } from '@prisma/client';
import { AppModule } from '../../../src/app.module.js';
import { configureApp } from '../../../src/app.setup.js';
import { AuthService } from '../../../src/auth/auth.service.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';

/** Піднімає справжній AppModule з тією ж конфігурацією, що й main.ts */
export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
) {
  let builder = Test.createTestingModule({ imports: [AppModule] });

  if (customize) {
    builder = customize(builder);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });

  app.useLogger(false);
  Logger.overrideLogger(false);

  configureApp(app);
  await app.init();

  return app;
}

export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "PullRequestReview", "RefreshToken", "User" CASCADE',
  );
}

let githubIdCounter = 1000;

export async function createUser(
  prisma: PrismaService,
  data: Partial<Prisma.UserCreateInput> = {},
): Promise<User> {
  githubIdCounter += 1;

  return prisma.user.create({
    data: {
      email: `user-${randomUUID()}@test.dev`,
      username: `user${githubIdCounter}`,
      githubId: String(githubIdCounter),
      githubUsername: `user${githubIdCounter}`,
      avatarUrl: 'https://avatars.example.com/u.png',
      ...data,
    },
  });
}

/** Заголовок Authorization з валідним access token для користувача */
export async function authHeader(app: NestExpressApplication, user: Pick<User, 'id' | 'email'>) {
  const token = await app.get(AuthService).generateAccessToken(user);

  return `Bearer ${token}`;
}

/** JWT з довільним payload (для перевірки протухлих/чужих токенів) */
export async function signRawJwt(payload: Record<string, unknown>, secret: string) {
  return new JwtService({ secret }).signAsync(payload);
}
