/**
 * Minimal typed client for the local backend.
 *
 * All calls go to same-origin `/api/*` (proxied by Next.js to FastAPI).
 * State-changing calls send the `X-GTA-Clips-Client` header the backend requires.
 */

const CLIENT_HEADER = { "X-GTA-Clips-Client": "web" } as const;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldError[];

  constructor(status: number, code: string, message: string, fields: FieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFieldErrors(details: unknown): FieldError[] {
  if (!isRecord(details) || !Array.isArray(details.fields)) return [];
  return details.fields.flatMap((f: unknown) =>
    isRecord(f) && typeof f.field === "string" && typeof f.message === "string"
      ? [{ field: f.field, message: f.message }]
      : [],
  );
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") Object.assign(headers, CLIENT_HEADER);
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    throw new ApiError(
      0,
      aborted ? "timeout" : "backend_unreachable",
      aborted
        ? "O backend demorou demais para responder."
        : "Não foi possível conectar ao backend. Ele está em execução?",
    );
  } finally {
    clearTimeout(timer);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    // A proxy error (backend offline) comes back as a non-JSON 5xx from Next.js.
    if (error === null && response.status >= 500) {
      throw new ApiError(
        response.status,
        "backend_unreachable",
        "Não foi possível conectar ao backend. Ele está em execução?",
      );
    }
    throw new ApiError(
      response.status,
      typeof error?.code === "string" ? error.code : `http_${response.status}`,
      typeof error?.message === "string" ? error.message : "Erro inesperado.",
      parseFieldErrors(error?.details),
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
};
