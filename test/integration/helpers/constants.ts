export const TEST_ENV = {
  JWT_SECRET: 'integration-test-jwt-secret',
  JWT_EXPIRES_IN: '15m',
  FRONTEND_URL: 'http://localhost:5173,http://localhost:4173',
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_CALLBACK_URL: 'http://localhost:3000/api/auth/github/callback',
  GITHUB_APP_ID: '12345',
  GITHUB_APP_SLUG: 'ai-coder-test',
  GITHUB_PRIVATE_KEY_PATH: 'keys/does-not-exist.pem',
  GITHUB_WEBHOOK_SECRET: 'integration-webhook-secret',
  GEMINI_API_KEY: 'test-gemini-key',
  GEMINI_MODEL: 'gemini-test-model',
} as const;
