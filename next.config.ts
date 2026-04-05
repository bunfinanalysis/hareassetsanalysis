import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Parent folder has another lockfile; keep tracing scoped to this app.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
