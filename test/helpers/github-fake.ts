import { vi } from 'vitest';
import type { Octokit } from 'octokit';
import type { GithubService } from '../../src/github/github.service.js';

type RouteHandler = (params: Record<string, unknown>) => unknown;

/** Маршрути GitHub API у форматі Octokit: 'GET /repos/{owner}/{repo}/pulls' → обробник */
export type GithubRoutes = Record<string, RouteHandler>;

/** Приватні методи GithubService, які підміняємо в тестах */
export interface GithubServiceInternals {
  createAppClient(): Promise<Octokit>;
  createInstallationClient(installationId: number): Promise<Octokit>;
  getPrivateKey(): Promise<string>;
}

/** Помилка у форматі Octokit RequestError */
export function githubError(status: number, url = '') {
  return Object.assign(new Error(`GitHub HttpError ${status}`), {
    status,
    request: { url },
    response: { data: { message: `status ${status}` } },
  });
}

export function createFakeOctokit(routes: GithubRoutes) {
  const call = async (route: string, params: Record<string, unknown> = {}) => {
    const handler = routes[route];

    if (!handler) {
      throw githubError(404, route);
    }

    return handler(params);
  };

  return {
    // octokit.request повертає { data }, octokit.paginate — одразу масив
    request: vi.fn(async (route: string, params?: Record<string, unknown>) => ({
      data: await call(route, params),
    })),
    paginate: vi.fn(async (route: string, params?: Record<string, unknown>) =>
      call(route, params),
    ),
  };
}

export type FakeOctokit = ReturnType<typeof createFakeOctokit>;

/**
 * Підміняє створення Octokit-клієнтів у GithubService:
 *  - `app` — маршрути для клієнта самого App (пошук інсталяцій);
 *  - `installation(id)` — маршрути для клієнта конкретної інсталяції.
 */
export function stubGithubClients(
  service: GithubService,
  options: {
    app?: GithubRoutes;
    installation?: (installationId: number) => GithubRoutes;
  } = {},
) {
  const internals = service as unknown as GithubServiceInternals;
  const appClient = createFakeOctokit(options.app ?? {});
  const installationClients = new Map<number, FakeOctokit>();

  const appSpy = vi
    .spyOn(internals, 'createAppClient')
    .mockResolvedValue(appClient as unknown as Octokit);

  const installationSpy = vi
    .spyOn(internals, 'createInstallationClient')
    .mockImplementation(async (installationId: number) => {
      const client = createFakeOctokit(options.installation?.(installationId) ?? {});
      installationClients.set(installationId, client);

      return client as unknown as Octokit;
    });

  return { appClient, appSpy, installationSpy, installationClients };
}
