import { defineConfig } from 'vitest/config';

// GitHub Pages sert le site sous /krach-test/ : la base doit correspondre au nom du dépôt.
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/krach-test/' : '/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
