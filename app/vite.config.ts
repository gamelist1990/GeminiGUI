import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  // Use relative paths in production build so Tauri can load assets from the local filesystem
  base: './',
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  // Build options to control chunking and reduce large single chunks
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // Split core react into its own chunk
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }

          // Heavy markdown and syntax highlighter libs
          if (id.includes('node_modules/react-markdown')) return 'react-markdown';
          if (id.includes('node_modules/react-syntax-highlighter')) return 'syntax-highlighter';

          // Tauri plugins separate chunk
          if (id.includes('@tauri-apps')) return 'tauri-plugins';

          // Fallback vendor chunk
          return 'vendor';
        },
      },
    },
    // Increase the warning threshold if you want to suppress the >500kb warning
    chunkSizeWarningLimit: 600,
  },
}));
