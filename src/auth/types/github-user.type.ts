import type { Request } from 'express';

export interface GithubUser {
  githubId: string;
  username: string;
  displayName: string;
  email: string | null;
}

export interface GithubRequest extends Request {
  user: GithubUser;
}