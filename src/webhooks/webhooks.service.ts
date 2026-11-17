import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

interface InstallationPayload {
    action: string
    installation: {
        id: number
        account: { id: number; login: string } | null
    }
}

interface PullRequestPayload {
    action: string
    pull_request: { number: number; title: string }
    repository: { full_name: string }
}

@Injectable()
export class WebhooksService {
    private readonly logger = new Logger(WebhooksService.name)

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {}

    /**
     * Перевіряє X-Hub-Signature-256. Без GITHUB_WEBHOOK_SECRET запити приймаються
     * лише поза production (для локальної розробки).
     */
    verifySignature(rawBody: Buffer | undefined, signature: string | undefined) {
        const secret = this.configService.get<string>('GITHUB_WEBHOOK_SECRET')

        if (!secret) {
            if (process.env.NODE_ENV === 'production') {
                throw new UnauthorizedException('Webhook secret is not configured')
            }

            this.logger.warn('GITHUB_WEBHOOK_SECRET is not set, skipping signature check')
            return
        }

        if (!rawBody || !signature) {
            throw new UnauthorizedException('Missing webhook signature')
        }

        const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
        const expectedBuffer = Buffer.from(expected)
        const signatureBuffer = Buffer.from(signature)

        if (
            expectedBuffer.length !== signatureBuffer.length ||
            !timingSafeEqual(expectedBuffer, signatureBuffer)
        ) {
            throw new UnauthorizedException('Invalid webhook signature')
        }
    }

    async handleGithubWebhook(event: string, payload: unknown) {
        this.logger.log(`Github event: ${event}`)

        if (event === 'ping') {
            return { message: 'Github webhook is working' }
        }

        if (event === 'installation') {
            return this.handleInstallation(payload as InstallationPayload)
        }

        if (event === 'pull_request') {
            return this.handlePullRequest(payload as PullRequestPayload)
        }

        return { message: `Event ${event} received` }
    }

    /** Тримає User.githubInstallationId в актуальному стані */
    private async handleInstallation(payload: InstallationPayload) {
        const { action, installation } = payload
        const accountId = installation.account?.id

        this.logger.log(`Installation ${installation.id} ${action} (${installation.account?.login})`)

        if (action === 'created' && accountId) {
            await this.prisma.user.updateMany({
                where: { githubId: String(accountId) },
                data: { githubInstallationId: installation.id },
            })
        }

        if (action === 'deleted') {
            await this.prisma.user.updateMany({
                where: { githubInstallationId: installation.id },
                data: { githubInstallationId: null },
            })
        }

        return { message: 'Installation webhook processed', action }
    }

    private async handlePullRequest(payload: PullRequestPayload) {
        const { action, pull_request: pullRequest, repository } = payload

        this.logger.log(`Pull Request event: ${action}`)
        this.logger.log(`Repository: ${repository.full_name}`)
        this.logger.log(`PR#${pullRequest.number}: ${pullRequest.title}`)

        return {
            message: "Pull request webhook received",
            action,
            repository: repository.full_name,
            pullRequest: pullRequest.number
        }
    }
}
