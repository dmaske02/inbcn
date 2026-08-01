import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 100],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
