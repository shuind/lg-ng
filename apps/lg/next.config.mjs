/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: "tsconfig.next.json",
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
