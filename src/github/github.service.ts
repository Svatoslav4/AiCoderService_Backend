import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PrismaService } from '../prisma/prisma.service.js';

interface GithubApiError {
  message?: string;
  status?: number;
  response?: {
    data?: unknown;
  };
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private privateKeyCache: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------- GitHub App auth ----------

  private getAppId(): string {
    const appId = this.configService.get<string>('GITHUB_APP_ID');

    if (!appId) {
      throw new InternalServerErrorException('GITHUB_APP_ID is missing');
    }

    return appId;
  }

  private async getPrivateKey(): Promise<string> {
    if (this.privateKeyCache) {
      return this.privateKeyCache;
    }

    const privateKeyPath = this.configService.get<string>(
      'GITHUB_PRIVATE_KEY_PATH',
    );

    if (!privateKeyPath) {
      throw new InternalServerErrorException(
        'GITHUB_PRIVATE_KEY_PATH is missing',
      );
    }

    let privateKey: string;

    try {
      privateKey = await readFile(
        resolve(process.cwd(), privateKeyPath),
        'utf8',
      );
    } catch {
      throw new InternalServerErrorException(
        'GitHub App private key file could not be read',
      );
    }

    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n').trim();

    if (
      !formattedPrivateKey.startsWith('-----BEGIN ') ||
      !formattedPrivateKey.includes('PRIVATE KEY-----') ||
      !formattedPrivateKey.includes('-----END ')
    ) {
      throw new InternalServerErrorException(
        'GitHub App private key has an invalid PEM format',
      );
    }

    this.privateKeyCache = formattedPrivateKey;

    return formattedPrivateKey;
  }

  /** Клієнт від імені самого App (JWT) — для пошуку інсталяцій */
  private async createAppClient(): Promise<Octokit> {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.getAppId(),
        privateKey: await this.getPrivateKey(),
      },
    });
  }

  /** Клієнт конкретної інсталяції — бачить лише репозиторії цієї інсталяції */
  private async createInstallationClient(
    installationId: number,
  ): Promise<Octokit> {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.getAppId(),
        privateKey: await this.getPrivateKey(),
        installationId,
      },
    });
  }

  getInstallUrl(): string | null {
    const slug = this.configService.get<string>('GITHUB_APP_SLUG');

    return slug ? `https://github.com/apps/${slug}/installations/new` : null;
  }

  private appNotInstalled(): never {
    throw new NotFoundException({
      statusCode: 404,
      error: 'GITHUB_APP_NOT_INSTALLED',
      message: 'GitHub App is not installed on your GitHub account',
      installUrl: this.getInstallUrl(),
    });
  }

  /**
   * Знаходить інсталяцію GitHub App на акаунті користувача.
   * ID кешується в User.githubInstallationId (оновлюється також вебхуком `installation`).
   */
  async findInstallationId(userId: string): Promise<number | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { githubInstallationId: true, githubUsername: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.githubInstallationId) {
      return user.githubInstallationId;
    }

    if (!user.githubUsername) {
      return null;
    }

    try {
      const appClient = await this.createAppClient();

      const response = await appClient.request(
        'GET /users/{username}/installation',
        { username: user.githubUsername },
      );

      await this.prisma.user.update({
        where: { id: userId },
        data: { githubInstallationId: response.data.id },
      });

      return response.data.id;
    } catch (error: unknown) {
      if ((error as GithubApiError).status === 404) {
        return null;
      }

      this.handleGithubError(error);
    }
  }

  async getInstallationStatus(userId: string) {
    const installationId = await this.findInstallationId(userId);

    return {
      installed: installationId !== null,
      installUrl: this.getInstallUrl(),
    };
  }

  private async getUserClient(userId: string): Promise<Octokit> {
    const installationId = await this.findInstallationId(userId);

    if (!installationId) {
      this.appNotInstalled();
    }

    return this.createInstallationClient(installationId);
  }

  /**
   * Виконує запит від імені інсталяції користувача.
   * Якщо інсталяцію видалили (закешований ID застарів), скидає кеш і повертає "not installed".
   */
  private async withUserClient<T>(
    userId: string,
    fn: (octokit: Octokit) => Promise<T>,
  ): Promise<T> {
    const octokit = await this.getUserClient(userId);

    try {
      return await fn(octokit);
    } catch (error: unknown) {
      if (this.isStaleInstallationError(error)) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { githubInstallationId: null },
        });

        this.appNotInstalled();
      }

      this.handleGithubError(error);
    }
  }

  private isStaleInstallationError(error: unknown): boolean {
    const githubError = error as GithubApiError;
    const url = (error as { request?: { url?: string } }).request?.url ?? '';

    return (
      githubError.status === 404 &&
      url.includes('/app/installations/') &&
      url.endsWith('/access_tokens')
    );
  }

  private handleGithubError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    const githubError = error as GithubApiError;

    this.logger.error(
      `GitHub API Error: ${githubError.status} ${githubError.message}`,
    );
    this.logger.debug(JSON.stringify(githubError.response?.data));

    if (githubError.status === 404) {
      throw new NotFoundException(
        'Repository or Pull Request not found (or not accessible to the GitHub App)',
      );
    }

    if (githubError.status === 403) {
      throw new ForbiddenException('Access to this GitHub resource is forbidden');
    }

    throw new ServiceUnavailableException('Could not fetch data from GitHub');
  }

  // ---------- Public API ----------

  async getRepositories(userId: string) {
    return this.withUserClient(userId, async (octokit) => {
      const repositories = await octokit.paginate(
        'GET /installation/repositories',
        { per_page: 100 },
      );

      return {
        totalCount: repositories.length,

        repositories: repositories.map((repository) => ({
          id: repository.id,
          name: repository.name,
          fullName: repository.full_name,
          owner: repository.owner.login,
          private: repository.private,
          description: repository.description,
          language: repository.language,
          htmlUrl: repository.html_url,
          defaultBranch: repository.default_branch,
          updatedAt: repository.updated_at,
        })),
      };
    });
  }

  async getPullRequests(userId: string, owner: string, repo: string) {
    return this.withUserClient(userId, async (octokit) => {
      const response = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls',
        {
          owner,
          repo,
          state: 'open',
          per_page: 100,
          sort: 'created',
          direction: 'desc',
        },
      );

      return {
        totalCount: response.data.length,

        pullRequests: response.data.map((pullRequest) => ({
          id: pullRequest.id,
          number: pullRequest.number,
          title: pullRequest.title,
          body: pullRequest.body,
          state: pullRequest.state,

          author: {
            username: pullRequest.user?.login ?? null,
            avatarUrl: pullRequest.user?.avatar_url ?? null,
          },

          htmlUrl: pullRequest.html_url,

          sourceBranch: pullRequest.head.ref,
          targetBranch: pullRequest.base.ref,

          draft: pullRequest.draft,

          createdAt: pullRequest.created_at,
          updatedAt: pullRequest.updated_at,
        })),
      };
    });
  }

  async getPullRequestDetails(
    userId: string,
    owner: string,
    repo: string,
    pullNumber: number,
  ) {
    return this.withUserClient(userId, async (octokit) => {
      const response = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}',
        {
          owner,
          repo,
          pull_number: pullNumber,
        },
      );

      const pullRequest = response.data;

      return {
        id: pullRequest.id,
        number: pullRequest.number,
        title: pullRequest.title,
        body: pullRequest.body,
        state: pullRequest.state,

        author: {
          username: pullRequest.user?.login ?? null,
          avatarUrl: pullRequest.user?.avatar_url ?? null,
        },

        htmlUrl: pullRequest.html_url,

        sourceBranch: pullRequest.head.ref,
        targetBranch: pullRequest.base.ref,

        draft: pullRequest.draft,
        merged: pullRequest.merged,

        additions: pullRequest.additions,
        deletions: pullRequest.deletions,
        changedFiles: pullRequest.changed_files,
        commits: pullRequest.commits,

        createdAt: pullRequest.created_at,
        updatedAt: pullRequest.updated_at,
        closedAt: pullRequest.closed_at,
        mergedAt: pullRequest.merged_at,
      };
    });
  }

  async getPullRequestFiles(
    userId: string,
    owner: string,
    repo: string,
    pullNumber: number,
  ) {
    return this.withUserClient(userId, async (octokit) => {
      const files = await octokit.paginate(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
        },
      );

      return {
        totalCount: files.length,

        files: files.map((file) => ({
          filename: file.filename,
          status: file.status,

          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,

          patch: file.patch ?? null,

          previousFilename: file.previous_filename ?? null,

          blobUrl: file.blob_url,
          rawUrl: file.raw_url,
        })),
      };
    });
  }
}
