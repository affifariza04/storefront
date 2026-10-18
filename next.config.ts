import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships a WASM build of Postgres; load it from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default config;
