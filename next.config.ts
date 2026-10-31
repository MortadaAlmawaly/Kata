import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  /* حزم Node الأصلية تبقى خارج الحزمة (Prisma/bcrypt/web-push) */
  serverExternalPackages: ["@prisma/client", "prisma", "bcryptjs", "web-push"],
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "same-origin" }] },
    ];
  },
};

export default nextConfig;