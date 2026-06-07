/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: "tsconfig.next.json",
  },
  images: {
    unoptimized: true,
  },
  outputFileTracingExcludes: {
    "/*": [
      "../../.lg-data/**",
      "data/**",
      "app/**",
      "components/**",
      "hooks/**",
      "lib/**",
      "scripts/**",
      "README.md",
      "chat-export-button.png",
      "components.json",
      "eslint.config.mjs",
      "next.config.mjs",
      "package.json",
      "postcss.config.mjs",
      "tsconfig*.json",
      "*.tsbuildinfo",
    ],
  },
  serverExternalPackages: ["novel-guide"],
}

export default nextConfig
