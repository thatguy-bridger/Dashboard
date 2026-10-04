import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keytar (an optional dependency of icloudjs, used only for OS keychain
  // credential storage that this app never calls into) ships a native
  // binary that the bundler can't place in an ESM chunk. Keep it external
  // so it's just `require()`d from node_modules at runtime instead.
  serverExternalPackages: ["keytar"],
  // Spotify OAuth's redirect URI must be 127.0.0.1 (not localhost) in dev,
  // so local testing needs that origin allowed for HMR/dev-resource requests.
  allowedDevOrigins: ["127.0.0.1"],
  // No floating Next.js logo badge over the wall display.
  devIndicators: false,
};

export default nextConfig;
