import { defineConfig } from 'vitest/config';

// GitHub Pages sert le site sous /krach-test/ : au build, la base doit correspondre au nom du dépôt.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/krach-test/' : '/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
