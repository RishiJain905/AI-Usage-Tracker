import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@": resolve("src/renderer/src"),
      },
    },
    define: {
      __BUILD_TIMESTAMP__: JSON.stringify(process.env.BUILD_TIMESTAMP || new Date().toISOString()),
    },
    plugins: [react(), tailwindcss()],
  },
});
