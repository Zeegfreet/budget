import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.spec.{ts,tsx}'],
      css: false,
      // CI runners are several times slower than a dev machine; the dashboard
      // specs render the whole grid and would pass the 5 s default there
      testTimeout: 20_000,
    },
  }),
)
