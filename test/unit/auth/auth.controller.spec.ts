import type { Response } from 'express';
import { AuthController } from '../../../src/auth/auth.controller.js';
import type { AuthService } from '../../../src/auth/auth.service.js';
import type { GithubRequest } from '../../../src/auth/types/github-user.type.js';
import { createConfigMock } from '../../helpers/config-mock.js';
import { makeGithubUser, makeUser } from '../../helpers/factories.js';

describe('AuthController', () => {
  const user = makeUser();
  let authService: {
    validateGithubUser: ReturnType<typeof vi.fn>;
    issueTokens: ReturnType<typeof vi.fn>;
    refreshTokens: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  const createController = (env: Record<string, string | undefined> = {}) =>
    new AuthController(authService as unknown as AuthService, createConfigMock(env));

  const createResponse = () => ({ redirect: vi.fn() });

  beforeEach(() => {
    authService = {
      validateGithubUser: vi.fn().mockResolvedValue(user),
      issueTokens: vi.fn().mockResolvedValue({ accessToken: 'access.jwt', refreshToken: 'refresh+token' }),
      refreshTokens: vi.fn(),
      logout: vi.fn(),
    };
  });

  describe('githubCallback', () => {
    it('redirects to the frontend with tokens in the URL fragment', async () => {
      const githubUser = makeGithubUser();
      const res = createResponse();

      await createController({ FRONTEND_URL: 'https://app.example.com' }).githubCallback(
        { user: githubUser } as GithubRequest,
        res as unknown as Response,
      );

      expect(authService.validateGithubUser).toHaveBeenCalledWith(githubUser);
      expect(authService.issueTokens).toHaveBeenCalledWith(user);
      // токени в # і URL-encoded
      expect(res.redirect).toHaveBeenCalledWith(
        'https://app.example.com/auth/callback#accessToken=access.jwt&refreshToken=refresh%2Btoken',
      );
    });

    it('uses the first origin from a comma-separated FRONTEND_URL and strips trailing slash', async () => {
      const res = createResponse();

      await createController({ FRONTEND_URL: ' https://app.example.com/ , http://localhost:5173' }).githubCallback(
        { user: makeGithubUser() } as GithubRequest,
        res as unknown as Response,
      );

      expect(res.redirect.mock.calls[0][0]).toMatch(/^https:\/\/app\.example\.com\/auth\/callback#/);
    });

    it('falls back to http://localhost:5173 when FRONTEND_URL is not set', async () => {
      const res = createResponse();

      await createController().githubCallback(
        { user: makeGithubUser() } as GithubRequest,
        res as unknown as Response,
      );

      expect(res.redirect.mock.calls[0][0]).toMatch(/^http:\/\/localhost:5173\/auth\/callback#/);
    });
  });

  it('refresh delegates to AuthService.refreshTokens', async () => {
    authService.refreshTokens.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    await expect(createController().refresh({ refreshToken: 'old' })).resolves.toEqual({
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(authService.refreshTokens).toHaveBeenCalledWith('old');
  });

  it('logout revokes the token and reports success', async () => {
    await expect(createController().logout({ refreshToken: 'old' })).resolves.toEqual({ success: true });
    expect(authService.logout).toHaveBeenCalledWith('old');
  });
});
