import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { JwtService } from '@nestjs/jwt'
import { GithubUser } from "./types/github-user.type.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

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
      return existingUser;
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
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
      },
      {
        expiresIn: '15m',
      },
    )
  }
}