import type { NextConfig } from "next";

/* STATIC_EXPORT=1: نسخة ثابتة تُنشر على GitHub Pages (وضع التجربة داخل المتصفح بدون خادم) */
const isStatic = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  /* حزم Node الأصلية تبقى خارج الحزمة (Prisma/bcrypt/web-push) */
  serverExternalPackages: ["@prisma/client", "prisma", "bcryptjs", "web-push"],
  ...(isStatic
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        ...(process.env.NEXT_PUBLIC_BASE_PATH ? { basePath: process.env.NEXT_PUBLIC_BASE_PATH } : {}),
      }
    : {
        async headers() {
          return [
            { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
            { source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "same-origin" }] },
          ];
        },
      }),
};

export default nextConfig;
