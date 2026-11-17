import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GithubService } from './github.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type.js';

@ApiTags('github')
@ApiBearerAuth()
@Controller('github')
@UseGuards(JwtAuthGuard)
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Get('installation')
  @ApiOperation({ summary: 'Whether the GitHub App is installed on the current user account (+ install URL)' })
  getInstallation(@Req() req: AuthenticatedRequest) {
    return this.githubService.getInstallationStatus(req.user.userId);
  }

  @Get('repositories')
  getRepositories(@Req() req: AuthenticatedRequest) {
    return this.githubService.getRepositories(req.user.userId);
  }

  @Get('repositories/:owner/:repo/pulls')
  getPullRequests(
    @Req() req: AuthenticatedRequest,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ) {
    return this.githubService.getPullRequests(req.user.userId, owner, repo);
  }

  @Get('repositories/:owner/:repo/pulls/:pullNumber')
  getPullRequestDetails(
    @Req() req: AuthenticatedRequest,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pullNumber', ParseIntPipe) pullNumber: number,
  ) {
    return this.githubService.getPullRequestDetails(
      req.user.userId,
      owner,
      repo,
      pullNumber,
    );
  }

  @Get('repositories/:owner/:repo/pulls/:pullNumber/files')
  getPullRequestFiles(
    @Req() req: AuthenticatedRequest,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pullNumber', ParseIntPipe) pullNumber: number,
  ) {
    return this.githubService.getPullRequestFiles(
      req.user.userId,
      owner,
      repo,
      pullNumber,
    );
  }
}
