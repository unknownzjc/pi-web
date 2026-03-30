import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../../", "");
  const apiPort = env.PORT || "3001";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
        "/ws": {
          target: `ws://127.0.0.1:${apiPort}`,
          ws: true,
        },
      },
    },
  };
});
