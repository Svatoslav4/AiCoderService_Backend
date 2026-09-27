import type { Request } from 'express';

export interface GithubUser {
  githubId: string,
  username: string,
  email?: string,
  avatarUrl: string,
  accessToken: string
}

export interface GithubRequest extends Request {
  user: GithubUser;
}