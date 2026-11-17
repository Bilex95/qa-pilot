/** Public FastAPI base URL used by the browser (docs/API_BOUNDARY.md). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Backend URL used by Next.js server code (session route handlers). Inside Docker this is the service name. */
export const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL ?? API_URL;
