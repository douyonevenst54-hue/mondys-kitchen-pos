import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC_PATHS = ["/login"];

// Customer-facing pages: open to everyone, logged in or not.
// /api/stripe is the Stripe webhook (it checks Stripe's signature itself).
const CUSTOMER_PATHS = ["/order", "/api/stripe"];

// Paths a logged-in user can access regardless of shift status.
// /shift/open is where we send cashiers without a shift; obviously they need
// to be able to reach it. /shift/close is for closing. Sign-out via API.
const SHIFT_EXEMPT_PATHS = ["/shift/open", "/shift/close", "/api"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next internals and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.includes(".") // static assets
  ) {
    return NextResponse.next();
  }

  if (CUSTOMER_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const sessionRaw = req.cookies.get(SESSION_COOKIE)?.value;
  // Signature + expiry check: a hand-made or edited cookie counts as no cookie.
  const session = await verifySession(sessionRaw);
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Not logged in → bounce to /login (unless we're already there)
  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    const res = NextResponse.redirect(url);
    if (sessionRaw) res.cookies.delete(SESSION_COOKIE); // bad or expired cookie
    return res;
  }

  // Logged in but on /login → bounce home
  if (session && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Logged in: CASHIERs without an open shift must visit /shift/open first.
  if (session) {
    const exempt = SHIFT_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
    if (session.role === "CASHIER" && !session.hasOpenShift && !exempt) {
      const url = req.nextUrl.clone();
      url.pathname = "/shift/open";
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next();
  // Staff pages hold customer and sales data: never cache them, never index them.
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};