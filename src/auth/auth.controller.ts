import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport';
import type { GithubRequest } from './types/github-user.type.js'

@Controller('auth')
export class AuthController {
    @Get('github')
    @UseGuards(AuthGuard('github'))
    async githubLogin() {

    }

    @Get('github/callback')
    @UseGuards(AuthGuard('github'))
    async githubCallback(@Req() req: GithubRequest) {
        return req.user
    }
}