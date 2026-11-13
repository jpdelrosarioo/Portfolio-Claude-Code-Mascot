import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root (a stray lockfile higher up the tree can confuse auto-detection)
  turbopack: { root: process.cwd() },
};

export default nextConfig;
