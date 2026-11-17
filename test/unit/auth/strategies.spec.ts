import { GithubStrategy } from '../../../src/auth/strategies/github.strategies.js';
import { JwtStrategy } from '../../../src/auth/strategies/jwt.strategies.js';

describe('Passport strategies', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'unit-secret');
    vi.stubEnv('GITHUB_CLIENT_ID', 'client-id');
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('GITHUB_CALLBACK_URL', 'http://localhost:3000/api/auth/github/callback');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('JwtStrategy', () => {
    it('maps JWT payload to request.user', async () => {
      const strategy = new JwtStrategy();

      await expect(strategy.validate({ sub: 'user-1', email: 'a@b.c' })).resolves.toEqual({
        userId: 'user-1',
        email: 'a@b.c',
      });
    });
  });

  describe('GithubStrategy', () => {
    it('maps GitHub profile to GithubUser', async () => {
      const strategy = new GithubStrategy();

      const result = await strategy.validate('gho_access', 'refresh', {
        id: '583231',
        username: 'octocat',
        emails: [{ value: 'octocat@example.com' }, { value: 'second@example.com' }],
        photos: [{ value: 'https://avatars.example.com/1.png' }],
      });

      expect(result).toEqual({
        githubId: '583231',
        username: 'octocat',
        email: 'octocat@example.com',
        avatarUrl: 'https://avatars.example.com/1.png',
        accessToken: 'gho_access',
      });
    });

    it('handles a profile without emails and photos', async () => {
      const strategy = new GithubStrategy();

      const result = await strategy.validate('gho_access', 'refresh', { id: '1' });

      expect(result.email).toBeUndefined();
      expect(result.avatarUrl).toBeUndefined();
    });
  });
});
