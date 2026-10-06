import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport';
import type { GithubRequest } from './types/github-user.type.js'
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService){}
    @Get('github')
    @UseGuards(AuthGuard('github'))
    async githubLogin() {}

    @Get('github/callback')
    @UseGuards(AuthGuard('github'))
    async githubCallback(@Req() req: GithubRequest) {
        const user = await this.authService.validateGithubUser(req.user)
        const accessToken = await this.authService.generateAccessToken({id: user.id,email: user.email})
        const refreshToken = await this.authService.generateRefreshToken(user.id)

        return{accessToken,refreshToken}
    }
}