import { execSync } from 'node:child_process';
import { getTestDatabaseUrl } from './test-database-url.js';

/** Один раз перед усіма інтеграційними тестами: накатує міграції на тестову БД. */
export default function globalSetup() {
  const databaseUrl = getTestDatabaseUrl();

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
