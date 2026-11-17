import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GithubService } from '../../../src/github/github.service.js';
import { createConfigMock } from '../../helpers/config-mock.js';
import {
  makeGithubPrFile,
  makeGithubPullRequest,
  makeGithubRepository,
} from '../../helpers/factories.js';
import {
  githubError,
  stubGithubClients,
  type GithubRoutes,
  type GithubServiceInternals,
} from '../../helpers/github-fake.js';
import { createPrismaMock, type PrismaMock } from '../../helpers/prisma-mock.js';

const BASE_ENV = {
  GITHUB_APP_ID: '12345',
  GITHUB_APP_SLUG: 'ai-coder',
  GITHUB_PRIVATE_KEY_PATH: 'keys/private-key.pem',
};

describe('GithubService', () => {
  let prisma: PrismaMock;

  const createService = (env: Record<string, string | undefined> = BASE_ENV) => {
    const mocks = createPrismaMock();
    prisma = mocks.mock;
    return new GithubService(createConfigMock(env), mocks.prisma);
  };

  /** користувач, у якого інсталяція вже закешована */
  const withInstalledUser = (installationId = 77) => {
    prisma.user.findUnique.mockResolvedValue({
      githubInstallationId: installationId,
      githubUsername: 'octocat',
    });
  };

  describe('getInstallUrl', () => {
    it('builds the install link from GITHUB_APP_SLUG', () => {
      expect(createService().getInstallUrl()).toBe(
        'https://github.com/apps/ai-coder/installations/new',
      );
    });

    it('returns null without a slug', () => {
      expect(createService({ ...BASE_ENV, GITHUB_APP_SLUG: undefined }).getInstallUrl()).toBeNull();
    });
  });

  describe('findInstallationId', () => {
    it('throws 404 for an unknown user', async () => {
      const service = createService();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findInstallationId('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the cached installation id without calling GitHub', async () => {
      const service = createService();
      const { appSpy } = stubGithubClients(service);
      withInstalledUser(55);

      await expect(service.findInstallationId('user-1')).resolves.toBe(55);
      expect(appSpy).not.toHaveBeenCalled();
    });

    it('returns null when the user has no GitHub username', async () => {
      const service = createService();
      const { appSpy } = stubGithubClients(service);
      prisma.user.findUnique.mockResolvedValue({ githubInstallationId: null, githubUsername: null });

      await expect(service.findInstallationId('user-1')).resolves.toBeNull();
      expect(appSpy).not.toHaveBeenCalled();
    });

    it('looks the installation up on GitHub and caches it', async () => {
      const service = createService();
      const { appClient } = stubGithubClients(service, {
        app: { 'GET /users/{username}/installation': () => ({ id: 999 }) },
      });
      prisma.user.findUnique.mockResolvedValue({ githubInstallationId: null, githubUsername: 'octocat' });

      await expect(service.findInstallationId('user-1')).resolves.toBe(999);

      expect(appClient.request).toHaveBeenCalledWith('GET /users/{username}/installation', {
        username: 'octocat',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { githubInstallationId: 999 },
      });
    });

    it('returns null when the App is not installed (GitHub 404)', async () => {
      const service = createService();
      stubGithubClients(service, {
        app: {
          'GET /users/{username}/installation': () => {
            throw githubError(404);
          },
        },
      });
      prisma.user.findUnique.mockResolvedValue({ githubInstallationId: null, githubUsername: 'octocat' });

      await expect(service.findInstallationId('user-1')).resolves.toBeNull();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('maps other GitHub failures to 503', async () => {
      const service = createService();
      stubGithubClients(service, {
        app: {
          'GET /users/{username}/installation': () => {
            throw githubError(500);
          },
        },
      });
      prisma.user.findUnique.mockResolvedValue({ githubInstallationId: null, githubUsername: 'octocat' });

      await expect(service.findInstallationId('user-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getInstallationStatus', () => {
    it('reports installed=false with the install link', async () => {
      const service = createService();
      prisma.user.findUnique.mockResolvedValue({ githubInstallationId: null, githubUsername: null });

      await expect(service.getInstallationStatus('user-1')).resolves.toEqual({
        installed: false,
        installUrl: 'https://github.com/apps/ai-coder/installations/new',
      });
    });

    it('reports installed=true', async () => {
      const service = createService();
      withInstalledUser();

      await expect(service.getInstallationStatus('user-1')).resolves.toMatchObject({ installed: true });
    });
  });

  describe('requests on behalf of the user installation', () => {
    it('throws GITHUB_APP_NOT_INSTALLED when there is no installation', async () => {
      const service = createService();
      prisma.user.findUnique.mockResolvedValue({ githubInstallationId: null, githubUsername: null });

      const error = await service.getRepositories('user-1').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        error: 'GITHUB_APP_NOT_INSTALLED',
        installUrl: 'https://github.com/apps/ai-coder/installations/new',
      });
    });

    it('uses the installation client of that user', async () => {
      const service = createService();
      const { installationSpy } = stubGithubClients(service, {
        installation: () => ({ 'GET /installation/repositories': () => [] }),
      });
      withInstalledUser(321);

      await service.getRepositories('user-1');

      expect(installationSpy).toHaveBeenCalledWith(321);
    });

    it('clears a stale installation id and asks to reinstall', async () => {
      const service = createService();
      stubGithubClients(service, {
        installation: () => ({
          'GET /installation/repositories': () => {
            throw githubError(404, 'https://api.github.com/app/installations/77/access_tokens');
          },
        }),
      });
      withInstalledUser(77);

      const error = await service.getRepositories('user-1').catch((e: unknown) => e);

      expect((error as NotFoundException).getResponse()).toMatchObject({ error: 'GITHUB_APP_NOT_INSTALLED' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { githubInstallationId: null },
      });
    });

    it.each([
      [404, NotFoundException],
      [403, ForbiddenException],
      [500, ServiceUnavailableException],
      [undefined, ServiceUnavailableException],
    ])('maps GitHub status %s to %s', async (status, expected) => {
      const service = createService();
      stubGithubClients(service, {
        installation: () => ({
          'GET /repos/{owner}/{repo}/pulls': () => {
            throw status ? githubError(status, 'https://api.github.com/repos/o/r/pulls') : new Error('network down');
          },
        }),
      });
      withInstalledUser();

      await expect(service.getPullRequests('user-1', 'o', 'r')).rejects.toBeInstanceOf(expected);
      // звичайна 404 (не протухла інсталяція) не скидає кеш
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('response mapping', () => {
    const setup = (routes: GithubRoutes) => {
      const service = createService();
      const stub = stubGithubClients(service, { installation: () => routes });
      withInstalledUser();
      return { service, ...stub };
    };

    it('getRepositories maps repositories', async () => {
      const { service } = setup({
        'GET /installation/repositories': () => [makeGithubRepository()],
      });

      await expect(service.getRepositories('user-1')).resolves.toEqual({
        totalCount: 1,
        repositories: [
          {
            id: 1296269,
            name: 'hello-world',
            fullName: 'octocat/hello-world',
            owner: 'octocat',
            private: false,
            description: 'My first repo',
            language: 'TypeScript',
            htmlUrl: 'https://github.com/octocat/hello-world',
            defaultBranch: 'main',
            updatedAt: '2026-02-02T00:00:00Z',
          },
        ],
      });
    });

    it('getPullRequests requests open PRs and maps them', async () => {
      const { service, installationClients } = setup({
        'GET /repos/{owner}/{repo}/pulls': () => [
          makeGithubPullRequest(),
          makeGithubPullRequest({ number: 8, user: null }),
        ],
      });

      const result = await service.getPullRequests('user-1', 'octocat', 'hello-world');

      expect(installationClients.get(77)?.request).toHaveBeenCalledWith(
        'GET /repos/{owner}/{repo}/pulls',
        expect.objectContaining({ owner: 'octocat', repo: 'hello-world', state: 'open' }),
      );
      expect(result.totalCount).toBe(2);
      expect(result.pullRequests[0]).toEqual({
        id: 1001,
        number: 7,
        title: 'Add login',
        body: 'Implements login',
        state: 'open',
        author: { username: 'contributor', avatarUrl: 'https://avatars.example.com/c.png' },
        htmlUrl: 'https://github.com/octocat/hello-world/pull/7',
        sourceBranch: 'feature/login',
        targetBranch: 'main',
        draft: false,
        createdAt: '2026-02-01T00:00:00Z',
        updatedAt: '2026-02-02T00:00:00Z',
      });
      // PR без автора (видалений акаунт)
      expect(result.pullRequests[1].author).toEqual({ username: null, avatarUrl: null });
    });

    it('getPullRequestDetails maps stats', async () => {
      const { service } = setup({
        'GET /repos/{owner}/{repo}/pulls/{pull_number}': (params) =>
          makeGithubPullRequest({ number: params.pull_number }),
      });

      const result = await service.getPullRequestDetails('user-1', 'octocat', 'hello-world', 7);

      expect(result).toMatchObject({
        number: 7,
        merged: false,
        additions: 10,
        deletions: 2,
        changedFiles: 2,
        commits: 3,
        closedAt: null,
        mergedAt: null,
      });
    });

    it('getPullRequestFiles maps files and nullifies missing patches', async () => {
      const { service } = setup({
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files': () => [
          makeGithubPrFile(),
          makeGithubPrFile({ filename: 'logo.png', patch: undefined, previous_filename: 'old.png' }),
        ],
      });

      const result = await service.getPullRequestFiles('user-1', 'octocat', 'hello-world', 7);

      expect(result.totalCount).toBe(2);
      expect(result.files[0]).toMatchObject({ filename: 'src/app.ts', previousFilename: null });
      expect(result.files[1]).toMatchObject({ filename: 'logo.png', patch: null, previousFilename: 'old.png' });
    });
  });

  describe('GitHub App credentials', () => {
    let dir: string;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'github-key-'));
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    const getPrivateKey = (service: GithubService) =>
      (service as unknown as GithubServiceInternals).getPrivateKey();

    it('fails without GITHUB_APP_ID', async () => {
      const service = createService({ ...BASE_ENV, GITHUB_APP_ID: undefined });

      await expect(
        (service as unknown as GithubServiceInternals).createAppClient(),
      ).rejects.toThrow('GITHUB_APP_ID is missing');
    });

    it('fails without GITHUB_PRIVATE_KEY_PATH', async () => {
      const service = createService({ ...BASE_ENV, GITHUB_PRIVATE_KEY_PATH: undefined });

      await expect(getPrivateKey(service)).rejects.toThrow('GITHUB_PRIVATE_KEY_PATH is missing');
    });

    it('fails when the key file cannot be read', async () => {
      const service = createService({ ...BASE_ENV, GITHUB_PRIVATE_KEY_PATH: join(dir, 'missing.pem') });

      await expect(getPrivateKey(service)).rejects.toThrow('could not be read');
    });

    it('rejects a file that is not a PEM key', async () => {
      const path = join(dir, 'bad.pem');
      await writeFile(path, 'definitely not a key');
      const service = createService({ ...BASE_ENV, GITHUB_PRIVATE_KEY_PATH: path });

      await expect(getPrivateKey(service)).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('accepts a PEM with escaped newlines and caches it', async () => {
      const path = join(dir, 'escaped.pem');
      await writeFile(path, '-----BEGIN RSA PRIVATE KEY-----\\nABC\\n-----END RSA PRIVATE KEY-----\n');
      const service = createService({ ...BASE_ENV, GITHUB_PRIVATE_KEY_PATH: path });

      const key = await getPrivateKey(service);
      expect(key).toBe('-----BEGIN RSA PRIVATE KEY-----\nABC\n-----END RSA PRIVATE KEY-----');

      // після видалення файлу ключ береться з кешу
      await rm(path);
      await expect(getPrivateKey(service)).resolves.toBe(key);
    });
  });
});
