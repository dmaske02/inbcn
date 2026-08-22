import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    proxyClientMaxBodySize: "11mb",
    serverActions: { bodySizeLimit: "11mb" },
  },
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
  },
  transpilePackages: ["@inbcn/database", "@inbcn/domain"],
};

export default nextConfig;
