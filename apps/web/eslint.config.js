import js from '@eslint/js'
import globals from 'globals'
import pluginQuery from '@tanstack/eslint-plugin-query'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/routeTree.gen.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      pluginQuery.configs['flat/recommended'],
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // shadcn components export variants alongside components; route files
    // export `Route` objects. Both are fine for Fast Refresh in practice.
    files: ['src/components/ui/**/*.tsx', 'src/routes/**/*.tsx', 'src/test/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
