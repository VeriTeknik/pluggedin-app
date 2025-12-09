/**
 * Serialize objects for JSON response, handling BigInt and Date types.
 *
 * This utility is used across API routes to ensure consistent JSON serialization
 * of database records that may contain BigInt IDs or Date timestamps.
 *
 * @param obj - The object to serialize
 * @returns A JSON-safe version of the object
 */
export function serializeForJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeForJson);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      result[key] = serializeForJson((obj as Record<string, unknown>)[key]);
    }
    return result;
  }
  return obj;
}
