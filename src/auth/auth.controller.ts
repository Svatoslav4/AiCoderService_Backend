import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import type { GithubRequest } from './types/github-user.type.js'
import { AuthService } from './auth.service.js'
import { RefreshTokenDto } from './dto/refresh-token.dto.js'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
    ) {}

    @Get('github')
    @UseGuards(AuthGuard('github'))
    @ApiOperation({ summary: 'Redirect to GitHub OAuth' })
    async githubLogin() {}

    @Get('github/callback')
    @UseGuards(AuthGuard('github'))
    @ApiOperation({ summary: 'GitHub OAuth callback, redirects to FRONTEND_URL/auth/callback#accessToken=...&refreshToken=...' })
    async githubCallback(@Req() req: GithubRequest, @Res() res: Response) {
        const user = await this.authService.validateGithubUser(req.user)
        const tokens = await this.authService.issueTokens(user)

        // Токени йдуть у фрагменті (#), щоб не потрапляти в логи серверів і Referer
        const params = new URLSearchParams(tokens)
        res.redirect(`${this.getFrontendUrl()}/auth/callback#${params.toString()}`)
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Exchange refresh token for a new token pair (rotation)' })
    @ApiOkResponse({ schema: { example: { accessToken: '...', refreshToken: '...' } } })
    async refresh(@Body() dto: RefreshTokenDto) {
        return this.authService.refreshTokens(dto.refreshToken)
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Revoke refresh token' })
    async logout(@Body() dto: RefreshTokenDto) {
        await this.authService.logout(dto.refreshToken)
        return { success: true }
    }

    private getFrontendUrl() {
        const urls = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173')
        return urls.split(',')[0].trim().replace(/\/$/, '')
    }
}
