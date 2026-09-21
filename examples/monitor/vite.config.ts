import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        headers: { Origin: "http://127.0.0.1:8787" },
      },
    },
  },
  build: { outDir: "../../.playground-dist", emptyOutDir: true },
});
