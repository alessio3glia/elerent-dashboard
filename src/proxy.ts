import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

// Controllo veloce del cookie: chi non è loggato va al login. Le pagine ricontrollano la sessione.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get("elerent_session")?.value;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
      return NextResponse.next();
    } catch {}
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
