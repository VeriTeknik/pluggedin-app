/**
 * Serialize objects for JSON response, handling BigInt and Date types.
 *
 * This utility is used across API routes to ensure consistent JSON serialization
 * of database records that may contain BigInt IDs or Date timestamps.
 *
 * PRECISION NOTE: BigInt values are converted to strings to preserve precision.
 * JavaScript's Number type can only safely represent integers up to 2^53-1
 * (Number.MAX_SAFE_INTEGER = 9007199254740991). Database IDs and other BigInt
 * values may exceed this limit, so string representation is used.
 * Clients should parse these as strings or use BigInt on the receiving end.
 *
 * @param obj - The object to serialize
 * @returns A JSON-safe version of the object
 */
export function serializeForJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  // Use toString() for BigInt to preserve precision for values > Number.MAX_SAFE_INTEGER
  if (typeof obj === 'bigint') return obj.toString();
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
