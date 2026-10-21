import parser from '@typescript-eslint/parser';
import plugin from '@typescript-eslint/eslint-plugin';
export default [
 { ignores: ['**/dist/**', '**/node_modules/**', 'legacy/**', 'src/**', 'packages/db/**'] },
 { files: ['**/*.ts'], languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
 plugins: { '@typescript-eslint': plugin },
 rules: { ...plugin.configs.recommended.rules, '@typescript-eslint/no-explicit-any':'error',
 '@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',caughtErrorsIgnorePattern:'^_'}], 'no-duplicate-imports':'error' } }
];
