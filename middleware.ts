import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_TOKEN = "folha-quinzenal-ok";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Libera: login e API de auth
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("folha-auth")?.value;
  if (token !== SESSION_TOKEN) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
