const isDev = process.env.NODE_ENV !== "production";

function originOf(url) {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}

// Without NEXT_PUBLIC_API_BASE the client calls <current host>:8000 (src/config/api.ts), which is not 'self'.
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_BASE) || "http: https:";
const pdfjsOrigin = originOf(process.env.NEXT_PUBLIC_PDFJS_ASSET_BASE);
const googleGsi = "https://accounts.google.com/gsi/";

// Next.js App Router emits inline bootstrap scripts, so 'unsafe-inline' is required without nonces.
// Dev: API defaults to <same host>:8000 and HMR uses websockets, so connect-src is relaxed.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${googleGsi}client`,
  `style-src 'self' 'unsafe-inline' ${googleGsi}style`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: blob:",
  `connect-src 'self' ${googleGsi} ${apiOrigin} ${pdfjsOrigin}${isDev ? " http: ws:" : ""}`,
  `worker-src 'self' blob: ${pdfjsOrigin}`,
  `frame-src ${googleGsi}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .map((directive) => directive.replace(/\s+/g, " ").trim())
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist がブラウザで 'canvas' モジュールを探してエラーになるのを防ぐ設定
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
