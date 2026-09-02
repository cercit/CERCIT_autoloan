import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// # reason: vite config: library rollup manualChunks; function syntax
// Self-review (vibe-check): vibe-check: (a) rollup library; (b) function form; (c) routes intact

export default defineConfig({
  base: "/CERCIT_autoloan/",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "spa.html",
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom"))
            return "vendor";
          if (id.includes("node_modules/@tanstack/react-router")) return "router";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-"))
            return "charts";
          if (
            id.includes("node_modules/@radix-ui/") ||
            id.includes("node_modules/lucide-react")
          )
            return "ui";
        },
      },
    },
  },
});
