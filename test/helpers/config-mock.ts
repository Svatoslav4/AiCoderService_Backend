import type { ConfigService } from '@nestjs/config';

/** Мінімальний ConfigService: get(key, default) читає з переданого об'єкта */
export function createConfigMock(values: Record<string, string | undefined> = {}) {
  const config = {
    get: <T = string>(key: string, defaultValue?: T): T | undefined =>
      (values[key] as T | undefined) ?? defaultValue,
    getOrThrow: <T = string>(key: string): T => {
      const value = values[key];

      if (value === undefined) {
        throw new TypeError(`Configuration key "${key}" does not exist`);
      }

      return value as T;
    },
  };

  return config as unknown as ConfigService;
}
