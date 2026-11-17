/** The backend error envelope {error: {code, message, details}} as a thrown value (REQ-054). */
export type ErrorDetail = { loc?: string[]; msg?: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field level messages keyed by the last segment of loc, for form errors. */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as ErrorDetail[]) {
      const key = d.loc?.[d.loc.length - 1];
      if (key && d.msg && !out[key]) out[key] = d.msg.replace(/^Value error, /, "");
    }
    return out;
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    const e = body.error ?? {};
    return new ApiError(res.status, e.code ?? "http_error", e.message ?? "Request failed.", e.details ?? {});
  } catch {
    return new ApiError(res.status, "network_error", "The server did not respond. Check your connection and try again.");
  }
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}
