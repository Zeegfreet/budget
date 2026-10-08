import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Files share one SQLite database, so run them one at a time
    fileParallelism: false,
    env: {
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'e2e-test-secret',
      // OAuth: fake credentials (test/oauth.e2e-spec.ts mocks the providers)
      WEB_URL: 'http://web.test',
      GITHUB_CLIENT_ID: 'github-test-id',
      GITHUB_CLIENT_SECRET: 'github-test-secret',
      GOOGLE_CLIENT_ID: 'google-test-id',
      GOOGLE_CLIENT_SECRET: 'google-test-secret',
    },
  },
});
