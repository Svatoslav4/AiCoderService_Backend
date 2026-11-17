import { Module } from '@nestjs/common';
import { AiReviewController } from './ai-review.controller.js';
import { AiReviewService } from './ai-review.service.js';
import { GithubModule } from '../github/github.module.js';

@Module({
  imports: [GithubModule],
  controllers: [AiReviewController],
  providers: [AiReviewService],
  exports: [AiReviewService],
})
export class AiReviewModule {}
