import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  // Use webpack mode for proper WASM support (web-ifc)
  webpack: (config) => {
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    })
    return config
  },
}

export default nextConfig
