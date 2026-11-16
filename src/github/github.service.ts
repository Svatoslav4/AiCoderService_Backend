
import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

@Injectable()
export class GithubService {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  private async createInstallationClient(): Promise<Octokit> {
    const appId = this.configService.get<string>(
      'GITHUB_APP_ID',
    );

    const privateKeyPath = this.configService.get<string>(
      'GITHUB_PRIVATE_KEY_PATH',
    );

    const installationId = this.configService.get<string>(
      'GITHUB_INSTALLATION_ID',
    );

    if (!appId) {
      throw new InternalServerErrorException(
        'GITHUB_APP_ID is missing',
      );
    }

    if (!privateKeyPath) {
      throw new InternalServerErrorException(
        'GITHUB_PRIVATE_KEY_PATH is missing',
      );
    }

    if (!installationId || !/^\d+$/.test(installationId)) {
      throw new InternalServerErrorException(
        'GITHUB_INSTALLATION_ID is missing or invalid',
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

    const formattedPrivateKey = privateKey
      .replace(/\\n/g, '\n')
      .trim();

    if (
      !formattedPrivateKey.startsWith('-----BEGIN ') ||
      !formattedPrivateKey.includes('PRIVATE KEY-----') ||
      !formattedPrivateKey.includes('-----END ')
    ) {
      throw new InternalServerErrorException(
        'GitHub App private key has an invalid PEM format',
      );
    }

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: formattedPrivateKey,
        installationId: Number(installationId),
      },
    });
  }

  async getRepositories() {
    try {
      const octokit = await this.createInstallationClient();

      const response = await octokit.request(
        'GET /installation/repositories',
        {
          per_page: 100,
        },
      );

      return {
        totalCount: response.data.total_count,

        repositories: response.data.repositories.map(
          (repository) => ({
            id: repository.id,
            name: repository.name,
            fullName: repository.full_name,
            private: repository.private,
            htmlUrl: repository.html_url,
            defaultBranch: repository.default_branch,
          }),
        ),
      };
    } catch (error: unknown) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      const githubError = error as {
        message?: string;
        status?: number;
        response?: {
          data?: unknown;
        };
      };

      console.error(
        'GitHub API Error:',
        githubError.message,
      );

      console.error(
        'GitHub Status:',
        githubError.status,
      );

      console.error(
        'GitHub Response:',
        githubError.response?.data,
      );

      throw new ServiceUnavailableException(
        'Could not fetch repositories from GitHub',
      );
    }
  }
}
