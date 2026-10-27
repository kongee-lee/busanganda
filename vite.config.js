import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로로 빌드해서 GitHub Pages(/busanganda/)에서도 그대로 동작하게 합니다.
  base: './',
  server: { port: 5173 },
  preview: { port: 4173 },
});
