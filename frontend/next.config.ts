import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Don't advertise the framework in every response header.
  poweredByHeader: false,
};

export default nextConfig;

