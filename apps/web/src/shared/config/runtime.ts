/**
 * Runtime values owned by the Next.js web application.
 *
 * Keep environment-variable reads here so feature code does not need to know
 * variable names or fallback values.
 */
const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_API_BASE_URL = "http://localhost:4000";

export function appUrl() {
  return process.env.APP_URL ?? DEFAULT_APP_URL;
}

export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}
