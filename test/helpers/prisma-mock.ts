import { vi } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

const createModelMock = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
});

/** Мок PrismaService для unit-тестів: кожен метод моделі — окремий vi.fn() */
export function createPrismaMock() {
  const mock = {
    user: createModelMock(),
    refreshToken: createModelMock(),
    pullRequestReview: createModelMock(),
  };

  return {
    mock,
    prisma: mock as unknown as PrismaService,
  };
}

export type PrismaMock = ReturnType<typeof createPrismaMock>['mock'];
