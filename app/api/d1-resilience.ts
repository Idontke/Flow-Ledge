const RETRYABLE_D1_MESSAGES = [
  "D1 DB is overloaded",
  "Requests queued for too long",
  "Too many requests queued",
  "transient issue on remote node",
  "Replica disconnected from primary",
  "storage caused object to be reset",
];

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` ${error.cause.message}` : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

export function isRetryableD1Error(error: unknown) {
  const message = errorMessage(error);
  return RETRYABLE_D1_MESSAGES.some((fragment) => message.includes(fragment));
}

export async function withD1ReadRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableD1Error(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 120 * 3 ** attempt));
    }
  }
  throw lastError;
}

export function d1ErrorResponse(error: unknown, fallback: string) {
  if (isRetryableD1Error(error)) {
    return Response.json(
      { error: "数据库暂时繁忙，本次请求未完成，请稍后重试。", code: "D1_BUSY" },
      { status: 503, headers: { "retry-after": "1" } },
    );
  }
  return Response.json(
    { error: fallback },
    { status: 500 },
  );
}
