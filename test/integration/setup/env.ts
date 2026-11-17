import { getTestDatabaseUrl } from './test-database-url.js';
import { TEST_ENV } from '../helpers/constants.js';

// process.env має пріоритет над .env у ConfigModule, тож тести не залежать від локальних секретів
process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';

Object.assign(process.env, TEST_ENV);
