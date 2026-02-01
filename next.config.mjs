import { execSync } from "child_process";

// Get Git SHA at build time
let gitSha = "development";
try {
  gitSha = execSync("git rev-parse --short HEAD").toString().trim();
} catch (e) {
  // Fallback for environments without git
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_GIT_SHA: gitSha,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
