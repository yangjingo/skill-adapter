/**
 * Parse JSON from an LLM text response.
 * Tries strategies in order: markdown code block → direct JSON → best-effort object extraction.
 */
export function parseJsonFromLlmResponse<T>(text: string): T | null {
  // 1. Try ```json ... ``` block
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try { return JSON.parse(jsonBlockMatch[1]) as T; } catch { /* fall through */ }
  }
  // 2. Try direct parse
  try { return JSON.parse(text) as T; } catch { /* fall through */ }
  // 3. Try {...} extraction (last-resort heuristic)
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]) as T; } catch { /* fall through */ }
  }
  return null;
}
