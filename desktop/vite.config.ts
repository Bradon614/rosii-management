import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Keep the terminal output clean when running through the Tauri CLI.
  clearScreen: false,
  server: {
    // Vite must listen on a fixed port; Tauri expects the devUrl below.
    port: 5173,
    strictPort: true,
    // Rust build output is locked by the running app on Windows; never watch it.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
});
