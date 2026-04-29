import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const SESSION_TOKEN = "folha-quinzenal-ok";

// Rate limiting: máx 10 tentativas por IP por minuto
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: NextRequest) {
  const VALID_USER = process.env.AUTH_USER;
  const VALID_PASS = process.env.AUTH_PASS;

  if (!VALID_USER || !VALID_PASS) {
    return NextResponse.json(
      { error: "Servidor mal configurado." },
      { status: 503 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um momento." },
      { status: 429 },
    );
  }

  const { usuario, senha } = (await request.json()) as {
    usuario: string;
    senha: string;
  };

  if (usuario === VALID_USER && senha === VALID_PASS) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("folha-auth", SESSION_TOKEN, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 10,
    });
    return res;
  }

  return NextResponse.json(
    { ok: false, error: "Usuário ou senha inválidos." },
    { status: 401 },
  );
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("folha-auth", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return res;
}
