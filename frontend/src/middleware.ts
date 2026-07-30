import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { EXEC_COMP_PARTNER_PATH, isPartnerExecCompHost } from "@/config/partner-exec-comp";

/** パートナー専用ドメインではシミュレーター以外のパスを隠す。 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  if (!isPartnerExecCompHost(host)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/icon.svg" ||
    pathname === "/favicon.ico" ||
    /\.(svg|png|jpg|jpeg|webp|ico)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname === EXEC_COMP_PARTNER_PATH) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = EXEC_COMP_PARTNER_PATH;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
