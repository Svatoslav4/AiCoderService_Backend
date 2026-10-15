import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class WebhooksService {
    private readonly logger = new Logger(WebhooksService.name)

    async hadleGithubWebhook(event: string, payload: string) {
        this.logger.log(`Github event: ${event}`)
        this.logger.debug(JSON.stringify(payload))

        if (event === 'ping') {
            return { message: 'Github webhook is working' }
        }
        
        if (event === 'pull_request') {
            return this.handlePullRequest(payload);
        }

        return { message: `Event ${event} received` }
    }

    private async handlePullRequest(payload: any) {
        const action = payload.action
        const pullRequest = payload.pull_request
        const repository = payload.repository

        this.logger.log(`Pull Request event:${action}`)
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