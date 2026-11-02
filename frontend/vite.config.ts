import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development `npm run dev` forwards /api to the API. Point it elsewhere with API_URL.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.API_URL ?? "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
  },
});
