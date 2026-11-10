import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "weblingo_secure_session_secret_2026_key_9988";

export interface SessionUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
}

/**
 * Hashes a plaintext password using crypto.scrypt with a unique random salt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plaintext password against the stored salt:hash format
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Generates a signed tamper-proof session token with payload and expiration
 */
export function createSessionToken(user: SessionUser, expiresInHours = 72): string {
  const expiresAt = Date.now() + expiresInHours * 3600 * 1000;
  const payload = JSON.stringify({ ...user, exp: expiresAt });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes a session token
 */
export function verifySessionToken(token: string): SessionUser | null {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return null;

    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(encodedPayload)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (Date.now() > payload.exp) {
      return null; // Expired
    }

    return {
      id: payload.id,
      email: payload.email,
      fullName: payload.fullName,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts the authenticated user id from a request (cookie or Bearer token).
 * Returns undefined when not authenticated.
 */
export function getUserIdFromRequest(request: Request): number | undefined {
  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie") || "";
  let token: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    const match = cookieHeader.match(/weblingo_session=([^;]+)/);
    if (match) token = match[1];
  }
  if (!token) return undefined;
  const user = verifySessionToken(token);
  return user ? user.id : undefined;
}

/**
 * Deterministic SHA-256 hash for translatable text deduplication
 */
export function hashSourceText(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}
