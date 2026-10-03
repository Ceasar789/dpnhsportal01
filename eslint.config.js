import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // 'dist' alone matches a dist directory at the repo root, and there
  // isn't one — the build output is frontend/dist, which was being linted
  // as source: 196 of the first run's 526 problems came from one minified
  // bundle. Also skip the backend's archived SQL/JS dumps and e2e scratch
  // cameras, none of which are shipped code.
  globalIgnores(['**/dist/**', '**/node_modules/**', 'archives/**', 'docs/archive/**', '**/zz-*.spec.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Everything above assumes a browser, which is right for frontend/src
  // and wrong for the code that never ships to one. 27 of the baseline's
  // errors were "'process' is not defined" in files where process is
  // simply there — the backend server, its scripts, the Playwright
  // config and the e2e helpers. That is a gap in what the config was
  // told, not 27 defects.
  {
    files: [
      'backend/**/*.js',
      'e2e/**/*.js',
      '*.config.js',
      'tools/**/*.mjs',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])