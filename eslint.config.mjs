import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Tắt rule namespace để cho phép mở rộng Request của Express
      '@typescript-eslint/no-namespace': 'off', 
      '@typescript-eslint/no-unused-vars': [
        'error', 
        { 
          'argsIgnorePattern': '^_',
          'varsIgnorePattern': '^_', // Thêm dòng này để áp dụng cho cả biến (vars)
          'caughtErrorsIgnorePattern': '^_' // Thêm dòng này để áp dụng cho biến trong catch
        }
      ],
    },
  }
);