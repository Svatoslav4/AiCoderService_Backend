import { NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../src/auth/types/authenticated-request.type.js';
import { UsersController } from '../../../src/users/users.controller.js';
import type { UsersService } from '../../../src/users/users.service.js';

describe('UsersController', () => {
  const request = { user: { userId: 'user-1', email: 'a@b.c' } } as AuthenticatedRequest;

  it('getMe returns the profile of the authenticated user', async () => {
    const profile = { id: 'user-1', email: 'a@b.c' };
    const usersService = { getProfile: vi.fn().mockResolvedValue(profile) };
    const controller = new UsersController(usersService as unknown as UsersService);

    await expect(controller.getMe(request)).resolves.toBe(profile);
    expect(usersService.getProfile).toHaveBeenCalledWith('user-1');
  });

  it('getMe throws 404 when the user was deleted', async () => {
    const usersService = { getProfile: vi.fn().mockResolvedValue(null) };
    const controller = new UsersController(usersService as unknown as UsersService);

    await expect(controller.getMe(request)).rejects.toBeInstanceOf(NotFoundException);
  });
});
