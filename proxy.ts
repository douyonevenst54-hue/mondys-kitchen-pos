import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

// Paths a logged-in user can access regardless of shift status.
// /shift/open is where we send cashiers without a shift; obviously they need
// to be able to reach it. /shift/close is for closing. Sign-out via API.
const SHIFT_EXEMPT_PATHS = ["/shift/open", "/shift/close", "/api"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next internals and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.includes(".") // static assets
  ) {
    return NextResponse.next();
  }

  const sessionRaw = req.cookies.get("mondy_session")?.value;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Not logged in → bounce to /login (unless we're already there)
  if (!sessionRaw && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in but on /login → bounce home
  if (sessionRaw && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Logged in: check if we need to enforce the open-shift rule.
  // The cookie also stores hasOpenShift (set/cleared by server actions).
  // CASHIERs without an open shift must visit /shift/open first.
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw) as {
        role: string;
        hasOpenShift?: boolean;
      };
      const exempt = SHIFT_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
      const isCashier = session.role === "CASHIER";
      if (isCashier && !session.hasOpenShift && !exempt) {
        const url = req.nextUrl.clone();
        url.pathname = "/shift/open";
        return NextResponse.redirect(url);
      }
    } catch {
      // Corrupted cookie — treat as not logged in
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      const res = NextResponse.redirect(url);
      res.cookies.delete("mondy_session");
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};