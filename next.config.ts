import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  ...(isGithubPages
    ? {
        basePath: "/edinburgh-cycle-parking",
        assetPrefix: "/edinburgh-cycle-parking",
      }
    : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
