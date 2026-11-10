import type { NextConfig } from "next";

/**
 * The browser only ever talks to this Next.js server. Requests to `/api/*` are
 * proxied to the local FastAPI backend, so the backend is never exposed to the
 * network and the frontend needs no CORS handling.
 */
const backendUrl = process.env.GTA_CLIPS_BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
