import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

/**
 * URL тестової БД:
 *  - TEST_DATABASE_URL, якщо задано;
 *  - інакше DATABASE_URL з .env, де ім'я бази замінене на `<name>_test`.
 *
 * Тести очищають таблиці, тому працюємо лише з базою, назва якої закінчується на `_test`.
 */
export function getTestDatabaseUrl(): string {
  let url = process.env.TEST_DATABASE_URL;

  if (!url) {
    let baseUrl = process.env.DATABASE_URL;

    if (!baseUrl) {
      try {
        baseUrl = parse(readFileSync(resolve(process.cwd(), '.env'))).DATABASE_URL;
      } catch {
        baseUrl = undefined;
      }
    }

    if (!baseUrl) {
      throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to run integration tests');
    }

    const parsed = new URL(baseUrl);
    const dbName = parsed.pathname.replace(/^\//, '');

    parsed.pathname = dbName.endsWith('_test') ? `/${dbName}` : `/${dbName}_test`;
    url = parsed.toString();
  }

  const dbName = new URL(url).pathname.replace(/^\//, '');

  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against "${dbName}": database name must end with "_test"`,
    );
  }

  return url;
}
