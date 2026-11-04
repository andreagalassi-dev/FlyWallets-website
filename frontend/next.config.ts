import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) used by frontend/Dockerfile.
  output: "standalone",
};

export default nextConfig;
