export type ToolResult<T> =
  | {
      ok: true;
      summary: string;
      data: T;
    }
  | {
      ok: false;
      summary: string;
      error: string;
      code?: string;
      details?: Record<string, unknown>;
    };

export function okToolResult<T>(summary: string, data: T): ToolResult<T> {
  return { ok: true, summary, data };
}

export function errorToolResult(error: string, code?: string, details?: Record<string, unknown>): ToolResult<never> {
  return {
    ok: false,
    summary: error,
    error,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  };
}
