import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  serverExternalPackages: [
    "pg",
    "@electric-sql/pglite",
    "sharp",
    "gltf-validator",
  ],
  // Private local evidence, legacy uploads and credentials never belong in a
  // serverless bundle, including a deployment built from a local checkout.
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./.env*", "./evidence/**/*", "./tests/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default withWorkflow(config);
