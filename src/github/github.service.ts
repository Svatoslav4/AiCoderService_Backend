import {Injectable,InternalServerErrorException,ServiceUnavailableException,} from '@nestjs/common';
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

    if (!appId || !privateKeyPath || !installationId) {
      throw new InternalServerErrorException(
        'GitHub App configuration is missing',
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
        'GitHub App private key could not be read',
      );
    }

    try {
      return new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId,
          privateKey,
          installationId,
        },
      });
    } catch {
      throw new InternalServerErrorException(
        'Could not initialize GitHub App client',
      );
    }
  }

  async getRepositories() {
    try {
      const octokit = await this.createInstallationClient();

      const response =
        await octokit.request(
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
      if (
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Could not fetch repositories from GitHub',
      );
    }
  }
}
