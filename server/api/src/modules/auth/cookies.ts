const productionCookieName = "__Host-nexora_session";
const nonProductionCookieName = "nexora_session";

export function sessionCookieName(secure: boolean): string {
  return secure ? productionCookieName : nonProductionCookieName;
}

export function readSessionCookie(cookieHeader: string | undefined, secure: boolean): string | null {
  if (!cookieHeader) return null;
  const expectedName = sessionCookieName(secure);
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== expectedName) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function serializeSessionCookie(token: string, expiresAt: Date, now: Date, secure: boolean): string {
  const maxAgeSeconds = Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return [
    `${sessionCookieName(secure)}=${encodeURIComponent(token)}`,
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt.toUTCString()}`,
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Strict",
  ].join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return [
    `${sessionCookieName(secure)}=`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Strict",
  ].join("; ");
}
