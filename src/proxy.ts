import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS policy:
 *  - /widget.js and /api/widget/* are public: any origin, no credentials.
 *    (Domain authorization is enforced inside the widget routes.)
 *  - Every other /api route is same-origin only: no CORS headers are added,
 *    so other websites cannot call dashboard APIs from a visitor's browser.
 */
const PUBLIC_PREFIXES = ["/api/widget/", "/widget.js"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));

  if (!isPublic) {
    if (request.method === "OPTIONS") return new NextResponse(null, { status: 204 });
    return NextResponse.next();
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Lets pages on private networks load the widget in Chrome (Private Network Access).
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
  };

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }
  const response = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/widget.js"],
};
