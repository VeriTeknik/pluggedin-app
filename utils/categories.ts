import { McpServerCategory } from '@/types/search';

/**
 * List of keywords that help identify server categories
 */
const CATEGORY_KEYWORDS: Record<McpServerCategory, string[]> = {
  [McpServerCategory.LLM]: [
    'llm', 'language model', 'ai model', 'gpt', 'openai', 'claude', 'anthropic', 
    'llama', 'mistral', 'gemini', 'groq', 'completion', 'chat'
  ],
  [McpServerCategory.UTILITY]: [
    'utility', 'helper', 'formatter', 'converter', 'parser', 'transform', 
    'calculator', 'validator', 'time', 'date', 'system'
  ],
  [McpServerCategory.TOOL]: [
    'tool', 'shell', 'exec', 'command', 'terminal', 'run', 'process', 
    'automation', 'script', 'workflow'
  ],
  [McpServerCategory.DATA]: [
    'data', 'database', 'sql', 'query', 'storage', 'db', 'fetch', 'api', 
    'document', 'file', 'read', 'write', 'save', 'load', 'access'
  ],
  [McpServerCategory.CONNECTOR]: [
    'connector', 'connect', 'integration', 'service', 'external', 'portal', 'gateway',
    'bridge', 'api', 'interface', 'client'
  ],
  [McpServerCategory.SEARCH]: [
    'search', 'find', 'discover', 'query', 'lookup', 'retrieval', 'retrieve', 
    'index', 'elasticsearch', 'rag', 'vector'
  ],
  [McpServerCategory.CODE]: [
    'code', 'programming', 'developer', 'git', 'version', 'repo', 'repository',
    'compiler', 'interpreter', 'lint', 'format', 'analyze', 'refactor'
  ],
  [McpServerCategory.IMAGE]: [
    'image', 'photo', 'picture', 'graphic', 'visual', 'png', 'jpg', 'jpeg',
    'svg', 'generate', 'create', 'edit', 'manipulation', 'dalle', 'midjourney'
  ],
  [McpServerCategory.AUDIO]: [
    'audio', 'sound', 'music', 'voice', 'speech', 'text-to-speech', 'tts',
    'speech-to-text', 'stt', 'wav', 'mp3', 'record', 'playback'
  ],
  [McpServerCategory.VIDEO]: [
    'video', 'movie', 'film', 'stream', 'youtube', 'vimeo', 'mp4', 'clip',
    'record', 'camera', 'player'
  ],
  [McpServerCategory.OTHER]: []
};

/**
 * Detect the most likely category for an MCP server based on its metadata
 * 
 * @param name - Server name
 * @param description - Server description
 * @param tags - Server tags
 * @returns The most likely category
 */
function detectCategory(
  name: string,
  description: string = '',
  tags: string[] = []
): McpServerCategory {
  // Convert inputs to lowercase for easier matching
  const normalizedName = name.toLowerCase();
  const normalizedDesc = description.toLowerCase();
  const normalizedTags = tags.map(t => t.toLowerCase());
  
  // Combine all text for matching
  const allText = `${normalizedName} ${normalizedDesc} ${normalizedTags.join(' ')}`;
  
  // Score each category based on keyword matches
  const scores = Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => {
    if (category === McpServerCategory.OTHER) return { category, score: 0 };
    
    const score = keywords.reduce((total, keyword) => {
      // Escape special regex characters in keyword
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Count occurrences of each keyword
      const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
      const count = (allText.match(regex) || []).length;
      
      // Weight matches in name and tags more heavily
      let weightedCount = count;
      if (normalizedName.match(regex)) weightedCount += 5;
      if (normalizedTags.some(tag => tag.match(regex))) weightedCount += 3;
      
      return total + weightedCount;
    }, 0);
    
    return { category: category as McpServerCategory, score };
  });
  
  // Sort by score in descending order
  scores.sort((a, b) => b.score - a.score);
  
  // Return the category with the highest score, or OTHER if no matches
  return scores[0].score > 0 ? scores[0].category : McpServerCategory.OTHER;
}

/**
 * Get the icon name for a category (for use with Lucide icons)
 * 
 * @param category - The category to get an icon for
 * @returns Icon name from Lucide icons
 */
export function getCategoryIcon(category: McpServerCategory): string {
  switch (category) {
    case McpServerCategory.LLM:
      return 'Brain';
    case McpServerCategory.UTILITY:
      return 'Wrench';
    case McpServerCategory.TOOL:
      return 'Tool';
    case McpServerCategory.DATA:
      return 'Database';
    case McpServerCategory.CONNECTOR:
      return 'Plug';
    case McpServerCategory.SEARCH:
      return 'Search';
    case McpServerCategory.CODE:
      return 'Code';
    case McpServerCategory.IMAGE:
      return 'Image';
    case McpServerCategory.AUDIO:
      return 'Music';
    case McpServerCategory.VIDEO:
      return 'Video';
    case McpServerCategory.OTHER:
    default:
      return 'CircleDot';
  }
} 