import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/htd/',
  test: { include: ['tests/**/*.test.ts'] },
});
