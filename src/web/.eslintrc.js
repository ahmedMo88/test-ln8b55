// ESLint configuration v8.45.0
// Integrates with TypeScript 5.0, React 18, and Prettier
// Enforces strict type checking and modern ECMAScript patterns

module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
    jest: true,
  },

  // Configure parser for TypeScript support
  parser: '@typescript-eslint/parser', // v6.0.0
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },

  // Extended configurations
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended', // v6.0.0
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended', // v7.33.0
    'plugin:react-hooks/recommended', // v4.6.0
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'prettier', // v8.8.0 - must be last to override other configs
  ],

  // Plugin definitions
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
    'import',
  ],

  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },

  // Rule configurations
  rules: {
    // TypeScript specific rules
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // React specific rules
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error',
    'react/prop-types': 'off', // Using TypeScript for prop validation
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/display-name': 'error',
    'react/jsx-key': ['error', { checkFragmentShorthand: true }],
    'react/no-array-index-key': 'error',
    'react/no-deprecated': 'error',

    // React Hooks rules
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Import rules
    'import/no-unresolved': 'error',
    'import/named': 'error',
    'import/namespace': 'error',
    'import/default': 'error',
    'import/export': 'error',
    'import/order': ['error', {
      'groups': [
        'builtin',
        'external',
        'internal',
        'parent',
        'sibling',
        'index',
      ],
      'newlines-between': 'always',
      'alphabetize': {
        order: 'asc',
        caseInsensitive: true,
      },
    }],

    // General ESLint rules
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-template': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-throw-literal': 'error',
    'no-return-await': 'error',
    'require-await': 'error',
  },

  // Override rules for specific file patterns
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'react/display-name': 'off',
      },
    },
    {
      files: ['vite.config.ts', '*.setup.ts'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
  ],
};