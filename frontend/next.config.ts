import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
  turbopack: {
    // Limit Turbopack's workspace search to the git root dynamically to support CI
    root: path.join(process.cwd(), '..'),
  },
};

export default nextConfig;
