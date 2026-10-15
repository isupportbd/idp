import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const cacheBase = process.env.LOCALAPPDATA || process.env.TEMP || ".";
const apiUrl = process.env.APP_URL || "http://localhost:3000";
const socketEnabled = process.env.SOCKET !== "false";

const proxy: Record<string, any> = {
  "/api": { target: apiUrl, changeOrigin: true },
  "/health": { target: apiUrl, changeOrigin: true },
  "/storage": { target: apiUrl, changeOrigin: true }
};

proxy["/socket.io"] = { target: apiUrl, changeOrigin: true, ws: true };

export default defineConfig({
  define: {
    __SOCKET_ENABLED__: socketEnabled,
    __API_URL__: JSON.stringify(apiUrl)
  },
  root: "src/resources",
  cacheDir: path.join(cacheBase, "nexgen", "vite-cache", "resources"),
  plugins: [vue()],
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true
      }
    }
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  build: {
    outDir: "../../public",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split large, rarely-changing dependencies into their own chunks so the
        // entry bundle stays small and vendor code is cached across deploys.
        // NOTE: this bundler (rolldown) requires a function rather than a map.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](socket\.io-client|engine\.io-client|socket\.io-parser|engine\.io-parser)[\\/]/.test(id)) {
            return "vendor-socket";
          }
          if (/[\\/]node_modules[\\/]axios[\\/]/.test(id)) {
            return "vendor-axios";
          }
          if (/[\\/]node_modules[\\/](vue|vue-router|pinia|@vueuse)[\\/]/.test(id)) {
            return "vendor-vue";
          }
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy
  }
});
