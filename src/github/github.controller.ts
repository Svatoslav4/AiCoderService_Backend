import {Controller,Get,Param,ParseIntPipe,UseGuards,} from '@nestjs/common';
import { GithubService } from './github.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';


@Controller('github')
@UseGuards(JwtAuthGuard)
export class GithubController {
  constructor(private readonly githubService: GithubService,) {}

  @Get('repositories')
  getRepositories() {
    return this.githubService.getRepositories();
  }

  @Get('repositories/:owner/:repo/pulls')
  getPullRequests(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ) {
    return this.githubService.getPullRequests(
      owner,
      repo,
    );
  }

  @Get('repositories/:owner/:repo/pulls/:pullNumber')
  getPullRequestDetails(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pullNumber', ParseIntPipe) pullNumber: number,
  ) {
    return this.githubService.getPullRequestDetails(
      owner,
      repo,
      pullNumber,
    );
  }

  @Get('repositories/:owner/:repo/pulls/:pullNumber/files')
  getPullRequestFiles(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pullNumber', ParseIntPipe) pullNumber: number,
  ) {
    return this.githubService.getPullRequestFiles(
      owner,
      repo,
      pullNumber,
    );
  }
}
