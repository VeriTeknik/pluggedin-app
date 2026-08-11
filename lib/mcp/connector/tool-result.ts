/**
 * The shape every connector tool answers in.
 *
 * Centralised because it was already copied between two handler files and four
 * more groups are coming. Duplicated response shaping drifts quietly: one file
 * starts pretty-printing, another stops setting isError, and a model sees two
 * different conventions from one server.
 */

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** A successful result. Indented because a model reads this, not a parser. */
export function toolText(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/**
 * A refusal the model should surface to the user.
 *
 * isError marks it as a tool-level failure rather than a transport one, so
 * Claude reports it instead of treating the connection as broken.
 */
export function toolFailure(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
