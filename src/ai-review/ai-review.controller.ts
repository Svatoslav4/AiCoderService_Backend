import { Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiReviewService } from './ai-review.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type.js';
import { ReviewHistoryQueryDto } from './dto/review-history-query.dto.js';

@ApiTags('ai-review')
@ApiBearerAuth()
@Controller('ai-review')
@UseGuards(JwtAuthGuard)
export class AiReviewController {
  constructor(private readonly aiReviewService: AiReviewService) {}

  @Post('test')
  async testGemini() {
    return this.aiReviewService.testGemini();
  }

  @Post('github/:owner/:repo/pulls/:pullNumber')
  @ApiOperation({ summary: 'Run AI review for a Pull Request (result is saved to history)' })
  async reviewPullRequest(
    @Req() req: AuthenticatedRequest,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pullNumber', ParseIntPipe) pullNumber: number,
  ) {
    return this.aiReviewService.reviewPullRequest(
      req.user.userId,
      owner,
      repo,
      pullNumber,
    );
  }

  @Get('github/:owner/:repo/pulls/:pullNumber')
  @ApiOperation({ summary: 'All saved reviews of a Pull Request (newest first)' })
  async getPullRequestReviews(
    @Req() req: AuthenticatedRequest,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pullNumber', ParseIntPipe) pullNumber: number,
  ) {
    return this.aiReviewService.getPullRequestReviews(
      req.user.userId,
      owner,
      repo,
      pullNumber,
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Review history of the current user (cursor pagination)' })
  async getHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: ReviewHistoryQueryDto,
  ) {
    return this.aiReviewService.getHistory(
      req.user.userId,
      query.limit ?? 20,
      query.cursor,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full saved review by ID' })
  async getReview(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.aiReviewService.getReview(req.user.userId, id);
  }
}
