// eslint.config.js  (ESM)
import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettierPlugin from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default [
  // Global ignores — these paths are never processed by any config block
  { ignores: ['dist/', 'node_modules/', '.vite/'] },

  // Lint your source files (browser)
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    ignores: ['dist', 'node_modules', '.vite'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      // ⬇ add browser globals so document/window aren’t flagged
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      prettier: prettierPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'prettier/prettier': 'error',
      'react/react-in-jsx-scope': 'off',
    },
    settings: { react: { version: 'detect' } },
  },

  // (Optional) Node/Config files (so `require`, `module`, etc. don’t error)
  {
    files: ['*.{js,cjs,mjs,ts,mts}', 'vite.config.*'],
    ignores: ['node_modules', 'dist', '.vite'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Keep ESLint from conflicting with Prettier
  prettierConfig,
]
