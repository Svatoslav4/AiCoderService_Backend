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
      scope: ['user:email'],
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