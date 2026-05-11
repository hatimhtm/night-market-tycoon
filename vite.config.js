import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  base: './',
  publicDir: false,
  build: {
    target: 'es2015',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`
      },
    },
    minify: 'terser',
    terserOptions: { compress: { passes: 2 } },
  },
});
