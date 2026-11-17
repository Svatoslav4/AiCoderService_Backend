import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor() {
    super({
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: process.env.GITHUB_CALLBACK_URL!,
      // Без scope: це GitHub App, а не OAuth App. Його токени ігнорують scopes, і з
      // 'user:email' passport-github2 запитує /user/emails, що падає з 403, якщо в
      // застосунку не ввімкнено дозвіл "Email addresses". Публічний email усе одно
      // приходить у профілі, а якщо його немає, AuthService підставляє <githubId>@github.local.
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: {
      id: string;
      username?: string;
      emails?: Array<{
        value: string;
      }>;
      photos?: Array<{
        value: string;
      }>;
    },
  ) {
    return {
      githubId: profile.id,
      username: profile.username,
      email: profile.emails?.[0]?.value,
      avatarUrl: profile.photos?.[0]?.value,
      accessToken,
    };
  }
}