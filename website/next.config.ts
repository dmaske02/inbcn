import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
  },
  transpilePackages: ["@inbcn/database", "@inbcn/domain"],
  experimental: {
    proxyClientMaxBodySize: "11mb",
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
  images: {
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
