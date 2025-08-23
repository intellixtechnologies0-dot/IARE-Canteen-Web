import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat()

export default [
  {
    ignores: ['dist'],
  },
  js.configs.recommended,
  ...compat.extends('plugin:react/recommended'),
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.vite,
  {
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
    },
  },
]
