import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keytar (an optional dependency of icloudjs, used only for OS keychain
  // credential storage that this app never calls into) ships a native
  // binary that the bundler can't place in an ESM chunk. Keep it external
  // so it's just `require()`d from node_modules at runtime instead.
  serverExternalPackages: ["keytar"],
};

export default nextConfig;
