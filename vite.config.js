import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react({ jsxRuntime: 'classic' }), tailwindcss()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'casino-dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/casino/main.jsx',
      cssFileName: 'casino-app',
      name: 'CasinoGames',
      formats: ['iife'],
      fileName: () => 'casino-app.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
