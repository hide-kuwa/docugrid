import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ★以下の webpack 設定を追加してください
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;