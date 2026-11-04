import { NextResponse } from "next/server";

export function proxy(request) {
  // We check for the refresh_token cookie as the primary indicator of a session
  // functionality (even if access_token is short-lived).
  const refreshToken = request.cookies.get("refresh_token");
  const pathname = request.nextUrl.pathname;

  // Paths that require authentication
  const protectedPaths = ["/dashboard"];
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));

  // Paths that are for guests only (login/register)
  // Exceptions: /register/verify-email is visited right after signup (cookies already set) and
  // /reset-password can be opened from an email link while a session exists.
  const authPaths = ["/login", "/register", "/forgot-password"];
  const sharedPaths = ["/register/verify-email", "/reset-password"];
  const isSharedPage = sharedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  const isAuthPage =
    !isSharedPage && authPaths.some((path) => pathname.startsWith(path));

  // 1. If trying to access protected route without token -> Redirect to Login
  if (isProtected && !refreshToken) {
    const loginUrl = new URL("/login", request.url);
    // loginUrl.searchParams.set('from', pathname); // Optional: Redirect back after login
    return NextResponse.redirect(loginUrl);
  }

  // 2. If trying to access auth pages (login/register) while logged in -> Redirect to Dashboard
  if (isAuthPage && refreshToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
