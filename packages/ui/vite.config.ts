import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html that runs from file:// with no server.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: "../../dist", emptyOutDir: true },
});
