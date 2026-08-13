import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
  turbopack: {
    // Limit Turbopack's workspace search to the git root to prevent it from looking into /home/justin
    root: "/home/justin/code/vtr/flux",
  },
};

export default nextConfig;
