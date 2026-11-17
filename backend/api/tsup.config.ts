import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/siglip-server.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: false,
  noExternal: [/^@kierratysappi\//u],
});
