import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiReviewService } from '../../../src/ai-review/ai-review.service.js';
import type { GithubService } from '../../../src/github/github.service.js';
import { createConfigMock } from '../../helpers/config-mock.js';
import { makeGeminiReview, makeReviewIssue, makeReviewRow } from '../../helpers/factories.js';
import { createPrismaMock, type PrismaMock } from '../../helpers/prisma-mock.js';

const gemini = vi.hoisted(() => ({
  constructorArgs: [] as unknown[],
  generateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: gemini.generateContent };

    constructor(options: unknown) {
      gemini.constructorArgs.push(options);
    }
  },
}));

const ENV = { GEMINI_API_KEY: 'gemini-key', GEMINI_MODEL: 'gemini-test' };

const prFile = (overrides: Record<string, unknown> = {}) => ({
  filename: 'src/app.ts',
  status: 'modified',
  additions: 2,
  deletions: 1,
  changes: 3,
  patch: '+const secret = "hunter2"',
  previousFilename: null,
  blobUrl: '',
  rawUrl: '',
  ...overrides,
});

const geminiReturns = (review: unknown) =>
  gemini.generateContent.mockResolvedValue({ text: JSON.stringify(review) });

describe('AiReviewService', () => {
  let prisma: PrismaMock;
  let github: {
    getPullRequestFiles: ReturnType<typeof vi.fn>;
    getPullRequestDetails: ReturnType<typeof vi.fn>;
  };

  const createService = (env: Record<string, string | undefined> = ENV) => {
    const mocks = createPrismaMock();
    prisma = mocks.mock;
    prisma.pullRequestReview.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ id: 'review-new', createdAt: new Date('2026-03-01T00:00:00Z'), ...data }),
    );

    return new AiReviewService(
      createConfigMock(env),
      github as unknown as GithubService,
      mocks.prisma,
    );
  };

  beforeEach(() => {
    gemini.constructorArgs.length = 0;
    gemini.generateContent.mockReset();
    github = {
      getPullRequestFiles: vi.fn().mockResolvedValue({ totalCount: 2, files: [prFile()] }),
      getPullRequestDetails: vi.fn().mockResolvedValue({ title: 'Add login' }),
    };
  });

  describe('testGemini', () => {
    it('returns the model reply', async () => {
      gemini.generateContent.mockResolvedValue({ text: 'connection successful' });

      await expect(createService().testGemini()).resolves.toEqual({
        success: true,
        provider: 'Google Gemini',
        model: 'gemini-test',
        response: 'connection successful',
      });
    });

    it('uses the default model when GEMINI_MODEL is not set', async () => {
      gemini.generateContent.mockResolvedValue({ text: 'ok' });

      const result = await createService({ GEMINI_API_KEY: 'key' }).testGemini();

      expect(result.model).toBe('gemini-3.1-flash-lite');
    });

    it('maps Gemini failures to 503', async () => {
      gemini.generateContent.mockRejectedValue(new Error('quota'));

      await expect(createService().testGemini()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('reviewPullRequest', () => {
    it('fails with 500 when GEMINI_API_KEY is missing, without calling GitHub', async () => {
      await expect(
        createService({}).reviewPullRequest('user-1', 'o', 'r', 1),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(github.getPullRequestFiles).not.toHaveBeenCalled();
    });

    it('fetches files and details on behalf of the user', async () => {
      geminiReturns(makeGeminiReview());

      await createService().reviewPullRequest('user-1', 'octocat', 'hello', 7);

      expect(github.getPullRequestFiles).toHaveBeenCalledWith('user-1', 'octocat', 'hello', 7);
      expect(github.getPullRequestDetails).toHaveBeenCalledWith('user-1', 'octocat', 'hello', 7);
    });

    it('returns 400 when there is nothing to review', async () => {
      github.getPullRequestFiles.mockResolvedValue({
        totalCount: 2,
        files: [prFile({ patch: null }), prFile({ patch: '   ' })],
      });

      await expect(
        createService().reviewPullRequest('user-1', 'o', 'r', 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(gemini.generateContent).not.toHaveBeenCalled();
    });

    it('returns 413 when the diff exceeds the limit', async () => {
      github.getPullRequestFiles.mockResolvedValue({
        totalCount: 1,
        files: [prFile({ patch: 'x'.repeat(30_001) })],
      });

      await expect(
        createService().reviewPullRequest('user-1', 'o', 'r', 1),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(gemini.generateContent).not.toHaveBeenCalled();
    });

    it('sends only reviewable files to Gemini and asks for JSON', async () => {
      github.getPullRequestFiles.mockResolvedValue({
        totalCount: 2,
        files: [prFile({ filename: 'src/a.ts', patch: '+added line' }), prFile({ filename: 'img.png', patch: null })],
      });
      geminiReturns(makeGeminiReview());

      await createService().reviewPullRequest('user-1', 'o', 'r', 1);

      expect(gemini.constructorArgs).toEqual([{ apiKey: 'gemini-key' }]);
      const request = gemini.generateContent.mock.calls[0][0];
      expect(request.model).toBe('gemini-test');
      expect(request.config).toEqual({ responseMimeType: 'application/json' });
      expect(request.contents).toContain('FILE: src/a.ts');
      expect(request.contents).toContain('+added line');
      expect(request.contents).not.toContain('img.png');
    });

    it('saves the review and returns it', async () => {
      geminiReturns(makeGeminiReview());

      const result = await createService().reviewPullRequest('user-1', 'octocat', 'hello', 7);

      expect(prisma.pullRequestReview.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          owner: 'octocat',
          repo: 'hello',
          pullNumber: 7,
          pullTitle: 'Add login',
          provider: 'Google Gemini',
          model: 'gemini-test',
          score: 72,
          summary: 'Solid PR with one security problem',
          issues: [makeReviewIssue()],
          positivePoints: ['Clear naming'],
          totalFiles: 2,
          analyzedFiles: 1,
        },
      });

      expect(result).toEqual({
        id: 'review-new',
        provider: 'Google Gemini',
        model: 'gemini-test',
        pullRequest: { owner: 'octocat', repo: 'hello', number: 7, title: 'Add login' },
        totalFiles: 2,
        analyzedFiles: 1,
        review: {
          summary: 'Solid PR with one security problem',
          score: 72,
          issues: [makeReviewIssue()],
          positivePoints: ['Clear naming'],
        },
        createdAt: new Date('2026-03-01T00:00:00Z'),
      });
    });

    it.each([
      ['empty response', { text: '' }],
      ['undefined text', {}],
      ['invalid JSON', { text: '{not json' }],
      ['JSON that is not an object', { text: '"hello"' }],
      ['missing summary', { text: JSON.stringify({ score: 1, issues: [] }) }],
      ['issues not an array', { text: JSON.stringify({ summary: 's', score: 1, issues: 'none' }) }],
    ])('returns 503 and saves nothing on %s', async (_case, response) => {
      gemini.generateContent.mockResolvedValue(response);

      await expect(
        createService().reviewPullRequest('user-1', 'o', 'r', 1),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.pullRequestReview.create).not.toHaveBeenCalled();
    });

    it('returns 503 when Gemini throws', async () => {
      gemini.generateContent.mockRejectedValue(new Error('timeout'));

      await expect(
        createService().reviewPullRequest('user-1', 'o', 'r', 1),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    describe('normalization of the model output', () => {
      const reviewWith = async (overrides: Record<string, unknown>) => {
        geminiReturns(makeGeminiReview(overrides));
        const result = await createService().reviewPullRequest('user-1', 'o', 'r', 1);
        return result.review;
      };

      it.each([
        [150, 100],
        [-5, 0],
        [87.6, 88],
        ['91', 91],
        ['abc', 0],
        [null, 0],
      ])('score %j becomes %j', async (score, expected) => {
        await expect(reviewWith({ score })).resolves.toMatchObject({ score: expected });
      });

      it('replaces unknown severity/category with safe defaults', async () => {
        const review = await reviewWith({
          issues: [makeReviewIssue({ severity: 'blocker', category: 'style' })],
        });

        expect(review.issues[0]).toMatchObject({ severity: 'low', category: 'quality' });
      });

      it('drops non-object issues and stringifies missing fields as empty strings', async () => {
        const review = await reviewWith({
          issues: ['oops', null, { severity: 'critical', category: 'bug', title: 42 }],
        });

        expect(review.issues).toEqual([
          { severity: 'critical', category: 'bug', file: '', title: '', description: '', suggestion: '' },
        ]);
      });

      it('keeps only string positive points', async () => {
        await expect(reviewWith({ positivePoints: ['good', 1, null, 'nice'] })).resolves.toMatchObject({
          positivePoints: ['good', 'nice'],
        });
      });

      it('defaults positive points to an empty array', async () => {
        await expect(reviewWith({ positivePoints: undefined })).resolves.toMatchObject({
          positivePoints: [],
        });
      });
    });
  });

  describe('history', () => {
    it('getHistory returns a page with nextCursor when there are more items', async () => {
      const service = createService();
      prisma.pullRequestReview.findMany.mockResolvedValue([
        makeReviewRow({ id: 'r3' }),
        makeReviewRow({ id: 'r2' }),
        makeReviewRow({ id: 'r1' }),
      ]);

      const result = await service.getHistory('user-1', 2);

      expect(prisma.pullRequestReview.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
      });
      expect(result.items.map((i) => i.id)).toEqual(['r3', 'r2']);
      expect(result.nextCursor).toBe('r2');
    });

    it('getHistory continues from a cursor and ends with nextCursor=null', async () => {
      const service = createService();
      prisma.pullRequestReview.findMany.mockResolvedValue([makeReviewRow({ id: 'r1' })]);

      const result = await service.getHistory('user-1', 2, 'r2');

      expect(prisma.pullRequestReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'r2' }, skip: 1 }),
      );
      expect(result.nextCursor).toBeNull();
    });

    it('list items contain issue counters instead of full issues', async () => {
      const service = createService();
      prisma.pullRequestReview.findMany.mockResolvedValue([makeReviewRow()]);

      const { items } = await service.getHistory('user-1', 20);

      expect(items[0]).toEqual({
        id: 'review-1',
        model: 'gemini-test-model',
        pullRequest: { owner: 'octocat', repo: 'hello-world', number: 7, title: 'Add login' },
        score: 72,
        summary: 'Solid PR',
        issuesCount: 3,
        issuesBySeverity: { critical: 0, high: 2, medium: 0, low: 1 },
        createdAt: new Date('2026-02-01T00:00:00Z'),
      });
    });

    it('getPullRequestReviews filters by user and PR', async () => {
      const service = createService();
      prisma.pullRequestReview.findMany.mockResolvedValue([makeReviewRow()]);

      const result = await service.getPullRequestReviews('user-1', 'octocat', 'hello-world', 7);

      expect(prisma.pullRequestReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', owner: 'octocat', repo: 'hello-world', pullNumber: 7 },
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('getReview only finds reviews of the same user', async () => {
      const service = createService();
      prisma.pullRequestReview.findFirst.mockResolvedValue(null);

      await expect(service.getReview('user-2', 'review-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.pullRequestReview.findFirst).toHaveBeenCalledWith({
        where: { id: 'review-1', userId: 'user-2' },
      });
    });

    it('getReview returns the full review', async () => {
      const service = createService();
      prisma.pullRequestReview.findFirst.mockResolvedValue(makeReviewRow());

      const result = await service.getReview('user-1', 'review-1');

      expect(result.review.issues).toHaveLength(3);
      expect(result.pullRequest.title).toBe('Add login');
    });
  });
});
