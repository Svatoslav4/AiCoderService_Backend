import { Controller,Headers,Post,Req } from "@nestjs/common";
import type { Request } from "express";
import { WebhooksService } from "./webhooks.service.js";

@Controller('webhooks')
export class WebhooksController {
    constructor(private readonly webhooksService: WebhooksService) {}
    @Post('github')
    async githubwebhooks(@Req() req: Request,@Headers('x-github-event') event: string) {
        return this.webhooksService.hadleGithubWebhook(event,req.body)
    }
}
