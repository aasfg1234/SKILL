import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ command }) => {
  const isProductionBuild = command === 'build';

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isProductionBuild ? [viteSingleFile()] : []),
    ],
    base: isProductionBuild ? './' : '/',
    ...(isProductionBuild
      ? {
          build: {
            assetsInlineLimit: Infinity,
            cssCodeSplit: false,
          },
        }
      : {}),
    server: {
      port: 5173,
      open: false,
      watch: {
        ignored: ['**/.claude/**', '**/.git/**'],
      },
    },
  };
});
