import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // iOS Safari 13–14 (still common on older coach phones)
    target: "es2019",
    sourcemap: false,
  },
});
