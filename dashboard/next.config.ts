import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" output is for self-hosting via Docker (dashboard/Dockerfile
  // copies .next/standalone directly - see Phase 5). Vercel does its own
  // serverless bundling and doesn't want this mode; it sets VERCEL=1 during
  // its own builds, so skip it there rather than breaking the Docker build
  // for everyone else.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
