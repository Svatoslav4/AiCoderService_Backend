import { Injectable, UnauthorizedException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service.js"
import { JwtService } from '@nestjs/jwt'
import { RefreshTokenService } from "./refresh-token.service.js"
import { GithubUser } from "./types/github-user.type.js"

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService,private readonly jwtService: JwtService,private readonly refreshTokenService: RefreshTokenService ) {}

  async findUserByGithubId(githubId: string) {
    return this.prisma.user.findUnique({
      where: {
        githubId,
      },
    });
  }

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  async validateGithubUser(githubUser: GithubUser) {
    const existingUser = await this.findUserByGithubId(
      githubUser.githubId,
    );

    if (existingUser) {
      // username/аватар на GitHub можуть змінитися, тож оновлюємо профіль
      return this.prisma.user.update({
        where: {
          id: existingUser.id,
        },
        data: {
          githubUsername: githubUser.username,
          avatarUrl: githubUser.avatarUrl,
        },
      });
    }

    if (githubUser.email) {
      const existingUserByEmail = await this.findUserByEmail(
        githubUser.email,
      );

      if (existingUserByEmail) {
        return this.prisma.user.update({
          where: {
            id: existingUserByEmail.id,
          },
          data: {
            githubId: githubUser.githubId,
            githubUsername: githubUser.username,
            avatarUrl: githubUser.avatarUrl,
          },
        });
      }
    }

    return this.prisma.user.create({
      data: {
        email:
          githubUser.email ??
          `${githubUser.githubId}@github.local`,
        username: githubUser.username,
        avatarUrl: githubUser.avatarUrl,
        githubId: githubUser.githubId,
        githubUsername: githubUser.username,
      },
    });
  }

  async generateAccessToken(user: { id: string; email: string }) {
    // Час життя береться з JWT_EXPIRES_IN (див. AuthModule)
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    })
  }

  async generateRefreshToken(userId: string) {
    return this.refreshTokenService.create(userId)
  }

  async issueTokens(user: { id: string; email: string }) {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user),
      this.generateRefreshToken(user.id),
    ])

    return { accessToken, refreshToken }
  }

  async refreshTokens(refreshToken: string) {
    const storedToken = await this.refreshTokenService.findValidToken(refreshToken)

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token')
    }

    // Ротація: старий токен відкликається атомарно; якщо його вже використали
    // паралельним запитом, revoke поверне false
    const revoked = await this.refreshTokenService.revoke(refreshToken)

    if (!revoked) {
      throw new UnauthorizedException('Invalid or expired refresh token')
    }

    const user = await this.prisma.user.findUnique({
      where: { id: storedToken.userId },
    })

    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    return this.issueTokens(user)
  }

  async logout(refreshToken: string) {
    await this.refreshTokenService.revoke(refreshToken)
  }
}