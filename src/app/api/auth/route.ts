import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Check active session from cookies or Authorization header
  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie") || "";

  let token: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    const match = cookieHeader.match(/weblingo_session=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
  }

  const user = verifySessionToken(token);
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
  }

  return NextResponse.json({ authenticated: true, user });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, password, fullName } = body;

    if (action === "logout") {
      const response = NextResponse.json({ ok: true, message: "Logged out successfully" });
      response.cookies.set("weblingo_session", "", {
        httpOnly: true,
        path: "/",
        maxAge: 0,
      });
      return response;
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (action === "register") {
      if (!fullName) {
        return NextResponse.json({ error: "Full name is required for registration" }, { status: 400 });
      }

      const existing = await db.query.users.findFirst({
        where: eq(users.email, cleanEmail),
      });

      if (existing) {
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 });
      }

      const [newUser] = await db
        .insert(users)
        .values({
          email: cleanEmail,
          passwordHash: hashPassword(password),
          fullName: fullName.trim(),
          role: "owner",
        })
        .returning();

      const sessionToken = createSessionToken({
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        role: newUser.role,
      });

      const response = NextResponse.json({
        ok: true,
        message: "Registration successful",
        user: { id: newUser.id, email: newUser.email, fullName: newUser.fullName, role: newUser.role },
        token: sessionToken,
      });

      response.cookies.set("weblingo_session", sessionToken, {
        httpOnly: true,
        path: "/",
        maxAge: 72 * 3600,
        sameSite: "lax",
      });

      return response;
    }

    // Default action: login
    const user = await db.query.users.findFirst({
      where: eq(users.email, cleanEmail),
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const sessionToken = createSessionToken({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });

    const response = NextResponse.json({
      ok: true,
      message: "Login successful",
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      token: sessionToken,
    });

    response.cookies.set("weblingo_session", sessionToken, {
      httpOnly: true,
      path: "/",
      maxAge: 72 * 3600,
      sameSite: "lax",
    });

    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
