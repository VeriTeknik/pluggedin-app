/**
 * Text chunking for RAG document processing.
 * Splits documents into overlapping chunks for vector embedding.
 */

interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_CHUNK_OVERLAP = 100;
const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

/**
 * Split text into overlapping chunks using recursive character splitting.
 * Tries to split on natural boundaries (paragraphs > newlines > sentences > words).
 */
export function splitTextIntoChunks(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkOverlap = DEFAULT_CHUNK_OVERLAP,
    separators = DEFAULT_SEPARATORS,
  } = options;

  if (!text || text.trim().length === 0) return [];
  if (text.length <= chunkSize) return [text];

  return recursiveSplit(text, separators, chunkSize, chunkOverlap);
}

function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): string[] {
  // Find the best separator that actually splits the text
  let separator = '';
  let splits: string[] = [text];

  for (const sep of separators) {
    if (sep === '') {
      splits = text.split('');
      separator = '';
      break;
    }
    if (text.includes(sep)) {
      splits = text.split(sep);
      separator = sep;
      break;
    }
  }

  // Merge splits into chunks of target size
  let currentChunk = '';
  const mergedSplits: string[] = [];

  for (const split of splits) {
    const piece = currentChunk ? currentChunk + separator + split : split;

    if (piece.length <= chunkSize) {
      currentChunk = piece;
    } else {
      if (currentChunk) mergedSplits.push(currentChunk);

      if (split.length > chunkSize) {
        const nextSeparators = separators.slice(separators.indexOf(separator) + 1);
        if (nextSeparators.length > 0) {
          mergedSplits.push(...recursiveSplit(split, nextSeparators, chunkSize, chunkOverlap));
          currentChunk = '';
          continue;
        }
      }
      currentChunk = split;
    }
  }

  if (currentChunk) mergedSplits.push(currentChunk);

  // Apply overlap between consecutive chunks
  const chunks: string[] = [];
  for (let i = 0; i < mergedSplits.length; i++) {
    if (i === 0) {
      chunks.push(mergedSplits[i]);
    } else {
      const prevChunk = mergedSplits[i - 1];
      const overlapText = prevChunk.slice(-chunkOverlap);
      const withOverlap = overlapText + separator + mergedSplits[i];
      chunks.push(withOverlap.length <= chunkSize * 1.2 ? withOverlap : mergedSplits[i]);
    }
  }

  return chunks;
}
