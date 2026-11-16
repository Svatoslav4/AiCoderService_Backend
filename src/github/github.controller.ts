
import { Controller, Get, UseGuards } from '@nestjs/common';
import { GithubService } from './github.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('github')
@UseGuards(JwtAuthGuard)
export class GithubController {
  constructor(
    private readonly githubService: GithubService,
  ) {}

  @Get('repositories')
  getRepositories() {
    return this.githubService.getRepositories();
  }
}
