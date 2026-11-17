import { Controller, Headers, HttpCode, HttpStatus, Post, Req, type RawBodyRequest } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";
import { WebhooksService } from "./webhooks.service.js";

@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
    constructor(private readonly webhooksService: WebhooksService) {}

    @Post('github')
    @HttpCode(HttpStatus.OK)
    async githubWebhooks(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-github-event') event: string,
        @Headers('x-hub-signature-256') signature: string | undefined,
    ) {
        this.webhooksService.verifySignature(req.rawBody, signature)

        return this.webhooksService.handleGithubWebhook(event, req.body)
    }
}
