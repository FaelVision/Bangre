import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is used from phones on the school's own wifi (http://192.168.x.x:3000),
  // not just from localhost. Without this, the dev server blocks those origins'
  // requests to dev-only assets and the pages load without working client JS.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.16.*.*", "*.local"],
  experimental: {
    // The student import posts a whole roster file (.xlsx or CSV) to a Server
    // Action; the default 1 MB body cap is tight for a large school export.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
