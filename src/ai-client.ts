const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

export async function callAIService<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AI_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "unknown error");
    throw new Error(`AI service ${path} failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<T>;
}
