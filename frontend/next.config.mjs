/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist がブラウザで 'canvas' モジュールを探してエラーになるのを防ぐ設定
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
