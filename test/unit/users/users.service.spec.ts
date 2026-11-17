import { ConflictException } from '@nestjs/common';
import { UsersService } from '../../../src/users/users.service.js';
import { createPrismaMock, type PrismaMock } from '../../helpers/prisma-mock.js';
import { makeUser } from '../../helpers/factories.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaMock;

  beforeEach(() => {
    const mocks = createPrismaMock();
    prisma = mocks.mock;
    service = new UsersService(mocks.prisma);
  });

  it('findAll returns all users', async () => {
    const users = [makeUser(), makeUser({ id: 'user-2' })];
    prisma.user.findMany.mockResolvedValue(users);

    await expect(service.findAll()).resolves.toBe(users);
  });

  it('findById looks up by id', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findById('nope')).resolves.toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'nope' } });
  });

  describe('getProfile', () => {
    it('selects only public profile fields', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

      await service.getProfile('user-1');

      const { where, select } = prisma.user.findUnique.mock.calls[0][0];
      expect(where).toEqual({ id: 'user-1' });
      expect(select).toEqual({
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        githubId: true,
        githubUsername: true,
        createdAt: true,
      });
      // внутрішні поля не віддаємо на фронт
      expect(select).not.toHaveProperty('githubInstallationId');
    });
  });

  describe('create', () => {
    it('throws ConflictException when email is taken', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.create({ email: 'octocat@example.com' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates a user with an empty avatar', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(makeUser());

      await service.create({ email: 'new@example.com', username: 'newbie' });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: 'new@example.com', username: 'newbie', avatarUrl: '' },
      });
    });
  });
});
