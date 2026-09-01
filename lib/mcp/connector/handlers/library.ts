/**
 * Library tools: the documents and knowledge base of a granted Hub.
 *
 * Every function here takes a `GrantedHub`, never a string. The shared actions
 * underneath accept `projectUuid?: string` and fall back to every document the
 * *user* owns when it is missing — harmless for the web UI, where the boundary
 * is the user, and a silent widening here, where the boundary is the Hub set
 * granted at consent. The branded type makes forgetting it a compile error
 * instead of a quiet leak with no symptom: the wrong documents come back and
 * the call looks like it worked.
 *
 * Results are shaped for a model to read, not for a UI to render. File paths,
 * internal profile ids and RAG document ids stay behind — a model does not need
 * them, and everything sent crosses a trust boundary.
 */

import { askKnowledgeBase, getDocByUuid, getDocs } from '@/app/actions/library';
import type { ConnectorIdentity } from '@/lib/oauth/provider/authenticate';

import type { GrantedHub } from '../hub-scope';
import { requireGrantedHub } from '../hub-scope';
import { toolFailure as failure, type ToolResult,toolText as text } from '../tool-result';

/** What a model is given about a document. Deliberately narrower than Doc. */
function summarise(doc: {
  uuid: string;
  name: string;
  description?: string | null;
  mime_type: string;
  file_size: number;
  tags?: string[] | null;
  created_at?: Date | string;
}) {
  return {
    id: doc.uuid,
    name: doc.name,
    description: doc.description ?? undefined,
    mimeType: doc.mime_type,
    sizeBytes: doc.file_size,
    tags: doc.tags ?? undefined,
    createdAt: doc.created_at,
  };
}

export async function listDocuments(
  identity: ConnectorIdentity,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const resolved = await requireGrantedHub(identity, params.hub);
  if (!resolved.ok) return failure(resolved.message);

  const result = await getDocs(identity.userId, resolved.hub);
  if (!result.success) return failure(result.error ?? 'Could not list documents.');

  const docs = (result.docs ?? []).map(summarise);
  return text({ hub: resolved.name, count: docs.length, documents: docs });
}

export async function getDocument(
  identity: ConnectorIdentity,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const id = typeof params.id === 'string' ? params.id.trim() : '';
  if (!id) return failure('id is required: pass a document id from pluggedin_list_documents');

  const resolved = await requireGrantedHub(identity, params.hub);
  if (!resolved.ok) return failure(resolved.message);

  const doc = await getDocByUuid(identity.userId, id, resolved.hub);
  if (!doc) {
    // The same answer whether the document does not exist or lives in a Hub
    // this token was not granted. Distinguishing them would confirm the
    // existence of documents the caller may not read.
    return failure(`No document ${id} in Hub "${resolved.name}".`);
  }

  return text({ hub: resolved.name, document: summarise(doc) });
}

export async function askKnowledge(
  identity: ConnectorIdentity,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const query = typeof params.query === 'string' ? params.query.trim() : '';
  if (!query) return failure('query is required');

  const resolved = await requireGrantedHub(identity, params.hub);
  if (!resolved.ok) return failure(resolved.message);

  const result = await askKnowledgeBase(identity.userId, query, resolved.hub);
  if (!result.success) return failure(result.error ?? 'The knowledge base could not answer.');

  return text({
    hub: resolved.name,
    answer: result.answer,
    sources: result.sources ?? [],
  });
}

/**
 * Exported for the type test: proves a handler cannot reach the shared actions
 * without a hub that requireGrantedHub produced. If this ever accepts a plain
 * string the boundary has stopped existing.
 */
export type LibraryScoped = (userId: string, hub: GrantedHub) => unknown;
