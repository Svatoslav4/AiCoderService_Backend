import type { PullRequestReview, User } from '@prisma/client';
import type { GithubUser } from '../../src/auth/types/github-user.type.js';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'octocat@example.com',
    username: 'octocat',
    avatarUrl: 'https://avatars.example.com/octocat.png',
    githubId: '583231',
    githubUsername: 'octocat',
    githubInstallationId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makeGithubUser(overrides: Partial<GithubUser> = {}): GithubUser {
  return {
    githubId: '583231',
    username: 'octocat',
    email: 'octocat@example.com',
    avatarUrl: 'https://avatars.example.com/octocat-new.png',
    accessToken: 'gho_test',
    ...overrides,
  };
}

export function makeReviewIssue(overrides: Record<string, unknown> = {}) {
  return {
    severity: 'high',
    category: 'security',
    file: 'src/app.ts',
    title: 'SQL injection',
    description: 'User input goes straight into the query',
    suggestion: 'Use parameterized queries',
    ...overrides,
  };
}

/** Валідна відповідь Gemini */
export function makeGeminiReview(overrides: Record<string, unknown> = {}) {
  return {
    summary: 'Solid PR with one security problem',
    score: 72,
    issues: [makeReviewIssue()],
    positivePoints: ['Clear naming'],
    ...overrides,
  };
}

export function makeReviewRow(overrides: Partial<PullRequestReview> = {}): PullRequestReview {
  return {
    id: 'review-1',
    userId: 'user-1',
    owner: 'octocat',
    repo: 'hello-world',
    pullNumber: 7,
    pullTitle: 'Add login',
    provider: 'Google Gemini',
    model: 'gemini-test-model',
    score: 72,
    summary: 'Solid PR',
    issues: [
      makeReviewIssue({ severity: 'high' }),
      makeReviewIssue({ severity: 'high' }),
      makeReviewIssue({ severity: 'low' }),
    ],
    positivePoints: ['Clear naming'],
    totalFiles: 3,
    analyzedFiles: 2,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  };
}

/** Файл PR у форматі відповіді GitHub API */
export function makeGithubPrFile(overrides: Record<string, unknown> = {}) {
  return {
    filename: 'src/app.ts',
    status: 'modified',
    additions: 3,
    deletions: 1,
    changes: 4,
    patch: '@@ -1,2 +1,4 @@\n-const a = 1\n+const a = 2\n+const b = 3',
    previous_filename: undefined,
    blob_url: 'https://github.com/octocat/hello-world/blob/sha/src/app.ts',
    raw_url: 'https://github.com/octocat/hello-world/raw/sha/src/app.ts',
    ...overrides,
  };
}

/** PR у форматі відповіді GitHub API */
export function makeGithubPullRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 1001,
    number: 7,
    title: 'Add login',
    body: 'Implements login',
    state: 'open',
    user: { login: 'contributor', avatar_url: 'https://avatars.example.com/c.png' },
    html_url: 'https://github.com/octocat/hello-world/pull/7',
    head: { ref: 'feature/login' },
    base: { ref: 'main' },
    draft: false,
    merged: false,
    additions: 10,
    deletions: 2,
    changed_files: 2,
    commits: 3,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-02T00:00:00Z',
    closed_at: null,
    merged_at: null,
    ...overrides,
  };
}

/** Репозиторій у форматі відповіді GitHub API */
export function makeGithubRepository(overrides: Record<string, unknown> = {}) {
  return {
    id: 1296269,
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    owner: { login: 'octocat' },
    private: false,
    description: 'My first repo',
    language: 'TypeScript',
    html_url: 'https://github.com/octocat/hello-world',
    default_branch: 'main',
    updated_at: '2026-02-02T00:00:00Z',
    ...overrides,
  };
}
