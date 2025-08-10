import { StoredMemory } from './memory-store';

export interface ContextBuilderConfig {
  maxTokens?: number;
  format?: 'structured' | 'narrative' | 'minimal';
  includeMetadata?: boolean;
  groupByType?: boolean;
}

export class MemoryContextBuilder {
  private config: Required<ContextBuilderConfig>;
  
  constructor(config: ContextBuilderConfig = {}) {
    this.config = {
      maxTokens: config.maxTokens || 500,
      format: config.format || 'structured',
      includeMetadata: config.includeMetadata ?? false,
      groupByType: config.groupByType ?? true
    };
  }
  
  /**
   * Build a compact context string from memories
   */
  buildContext(memories: StoredMemory[], language?: string): string {
    if (memories.length === 0) {
      return '';
    }
    
    switch (this.config.format) {
      case 'narrative':
        return this.buildNarrativeContext(memories, language);
      case 'minimal':
        return this.buildMinimalContext(memories);
      case 'structured':
      default:
        return this.buildStructuredContext(memories, language);
    }
  }
  
  /**
   * Build structured context (default format)
   */
  private buildStructuredContext(memories: StoredMemory[], language?: string): string {
    const header = this.getContextHeader(language);
    
    if (this.config.groupByType) {
      // Group memories by fact type
      const grouped = this.groupMemoriesByType(memories);
      
      let context = header + '\n\n';
      
      for (const [type, mems] of Object.entries(grouped)) {
        const typeLabel = this.getFactTypeLabel(type, language);
        context += `${typeLabel}:\n`;
        
        for (const memory of mems) {
          context += this.formatMemory(memory);
        }
        
        context += '\n';
      }
      
      return context.trim();
    } else {
      // List memories by importance/relevance
      let context = header + '\n\n';
      
      for (const memory of memories) {
        context += this.formatMemory(memory);
      }
      
      return context.trim();
    }
  }
  
  /**
   * Build narrative context (more natural language)
   */
  private buildNarrativeContext(memories: StoredMemory[], language?: string): string {
    const header = this.getContextHeader(language);
    
    // Group by subject for narrative flow
    const bySubject = this.groupMemoriesBySubject(memories);
    
    let narrative = header + '\n\n';
    
    for (const [subject, mems] of Object.entries(bySubject)) {
      if (subject === 'user') {
        narrative += this.getUserNarrative(mems, language);
      } else if (subject === 'unknown') {
        narrative += this.getGeneralNarrative(mems, language);
      } else {
        narrative += this.getSubjectNarrative(subject, mems, language);
      }
    }
    
    return narrative.trim();
  }
  
  /**
   * Build minimal context (most compact)
   */
  private buildMinimalContext(memories: StoredMemory[]): string {
    return memories
      .map(m => {
        const prefix = this.getImportancePrefix(m.importance);
        return `${prefix}${m.content}`;
      })
      .join('\n');
  }
  
  /**
   * Format a single memory
   */
  private formatMemory(memory: StoredMemory): string {
    let formatted = '';
    
    // Add importance indicator
    const importanceMarker = this.getImportanceMarker(memory.importance);
    formatted += `${importanceMarker} `;
    
    // Add the content
    formatted += memory.content;
    
    // Add metadata if configured
    if (this.config.includeMetadata) {
      const metadata = [];
      
      if (memory.confidence < 0.7) {
        metadata.push(`confidence: ${Math.round(memory.confidence * 100)}%`);
      }
      
      if (memory.metadata?.expiresAt) {
        metadata.push(`expires: ${new Date(memory.metadata.expiresAt).toLocaleDateString()}`);
      }
      
      if (memory.metadata?.subject && memory.metadata.subject !== 'user') {
        metadata.push(`about: ${memory.metadata.subject}`);
      }
      
      if (metadata.length > 0) {
        formatted += ` (${metadata.join(', ')})`;
      }
    }
    
    formatted += '\n';
    
    return formatted;
  }
  
  /**
   * Group memories by fact type
   */
  private groupMemoriesByType(memories: StoredMemory[]): Record<string, StoredMemory[]> {
    const grouped: Record<string, StoredMemory[]> = {};
    
    for (const memory of memories) {
      const type = memory.factType || 'other';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(memory);
    }
    
    // Sort each group by importance
    for (const type in grouped) {
      grouped[type].sort((a, b) => b.importance - a.importance);
    }
    
    return grouped;
  }
  
  /**
   * Group memories by subject
   */
  private groupMemoriesBySubject(memories: StoredMemory[]): Record<string, StoredMemory[]> {
    const grouped: Record<string, StoredMemory[]> = {};
    
    for (const memory of memories) {
      const subject = memory.metadata?.subject || 'unknown';
      if (!grouped[subject]) {
        grouped[subject] = [];
      }
      grouped[subject].push(memory);
    }
    
    return grouped;
  }
  
  /**
   * Get context header based on language
   */
  private getContextHeader(language?: string): string {
    const headers: Record<string, string> = {
      en: '📚 CONVERSATION CONTEXT & MEMORIES',
      tr: '📚 KONUŞMA BAĞLAMI VE ANILAR',
      zh: '📚 对话背景和记忆',
      ja: '📚 会話のコンテキストとメモリー',
      hi: '📚 बातचीत का संदर्भ और यादें',
      nl: '📚 GESPREKSCONTEXT EN HERINNERINGEN'
    };
    
    return headers[language || 'en'] || headers.en;
  }
  
  /**
   * Get fact type label
   */
  private getFactTypeLabel(type: string, language?: string): string {
    const labels: Record<string, Record<string, string>> = {
      personal_info: {
        en: '👤 Personal Information',
        tr: '👤 Kişisel Bilgiler',
        zh: '👤 个人信息',
        ja: '👤 個人情報',
        hi: '👤 व्यक्तिगत जानकारी',
        nl: '👤 Persoonlijke Informatie'
      },
      preference: {
        en: '⭐ Preferences',
        tr: '⭐ Tercihler',
        zh: '⭐ 偏好',
        ja: '⭐ 好み',
        hi: '⭐ प्राथमिकताएं',
        nl: '⭐ Voorkeuren'
      },
      work_info: {
        en: '💼 Work Information',
        tr: '💼 İş Bilgileri',
        zh: '💼 工作信息',
        ja: '💼 仕事情報',
        hi: '💼 कार्य जानकारी',
        nl: '💼 Werkinformatie'
      },
      technical_detail: {
        en: '🔧 Technical Details',
        tr: '🔧 Teknik Detaylar',
        zh: '🔧 技术细节',
        ja: '🔧 技術的な詳細',
        hi: '🔧 तकनीकी विवरण',
        nl: '🔧 Technische Details'
      },
      goal: {
        en: '🎯 Goals & Plans',
        tr: '🎯 Hedefler ve Planlar',
        zh: '🎯 目标与计划',
        ja: '🎯 目標と計画',
        hi: '🎯 लक्ष्य और योजनाएं',
        nl: '🎯 Doelen & Plannen'
      },
      problem: {
        en: '⚠️ Problems & Challenges',
        tr: '⚠️ Sorunlar ve Zorluklar',
        zh: '⚠️ 问题与挑战',
        ja: '⚠️ 問題と課題',
        hi: '⚠️ समस्याएं और चुनौतियां',
        nl: '⚠️ Problemen & Uitdagingen'
      },
      relationship: {
        en: '🤝 Relationships',
        tr: '🤝 İlişkiler',
        zh: '🤝 关系',
        ja: '🤝 関係',
        hi: '🤝 संबंध',
        nl: '🤝 Relaties'
      },
      event: {
        en: '📅 Events',
        tr: '📅 Etkinlikler',
        zh: '📅 事件',
        ja: '📅 イベント',
        hi: '📅 घटनाएं',
        nl: '📅 Gebeurtenissen'
      },
      solution: {
        en: '✅ Solutions',
        tr: '✅ Çözümler',
        zh: '✅ 解决方案',
        ja: '✅ ソリューション',
        hi: '✅ समाधान',
        nl: '✅ Oplossingen'
      },
      context: {
        en: '📋 Context',
        tr: '📋 Bağlam',
        zh: '📋 背景',
        ja: '📋 コンテキスト',
        hi: '📋 संदर्भ',
        nl: '📋 Context'
      },
      other: {
        en: '📌 Other Information',
        tr: '📌 Diğer Bilgiler',
        zh: '📌 其他信息',
        ja: '📌 その他の情報',
        hi: '📌 अन्य जानकारी',
        nl: '📌 Overige Informatie'
      }
    };
    
    const lang = language || 'en';
    return labels[type]?.[lang] || labels[type]?.en || labels.other[lang] || labels.other.en;
  }
  
  /**
   * Get importance marker
   */
  private getImportanceMarker(importance: number): string {
    if (importance >= 9) return '❗️';
    if (importance >= 7) return '•';
    if (importance >= 5) return '◦';
    return '·';
  }
  
  /**
   * Get importance prefix for minimal format
   */
  private getImportancePrefix(importance: number): string {
    if (importance >= 9) return '[!] ';
    if (importance >= 7) return '[*] ';
    if (importance >= 5) return '[-] ';
    return '';
  }
  
  /**
   * Build narrative for user-related memories
   */
  private getUserNarrative(memories: StoredMemory[], language?: string): string {
    const intros: Record<string, string> = {
      en: 'About the user: ',
      tr: 'Kullanıcı hakkında: ',
      zh: '关于用户：',
      ja: 'ユーザーについて：',
      hi: 'उपयोगकर्ता के बारे में: ',
      nl: 'Over de gebruiker: '
    };
    
    const intro = intros[language || 'en'] || intros.en;
    const facts = memories.map(m => m.content).join('. ');
    
    return intro + facts + '.\n\n';
  }
  
  /**
   * Build narrative for subject-specific memories
   */
  private getSubjectNarrative(subject: string, memories: StoredMemory[], language?: string): string {
    const intros: Record<string, string> = {
      en: `Regarding ${subject}: `,
      tr: `${subject} hakkında: `,
      zh: `关于${subject}：`,
      ja: `${subject}について：`,
      hi: `${subject} के बारे में: `,
      nl: `Betreffende ${subject}: `
    };
    
    const intro = intros[language || 'en'] || intros.en;
    const facts = memories.map(m => m.content).join('. ');
    
    return intro + facts + '.\n\n';
  }
  
  /**
   * Build narrative for general memories
   */
  private getGeneralNarrative(memories: StoredMemory[], language?: string): string {
    const intros: Record<string, string> = {
      en: 'Additional context: ',
      tr: 'Ek bağlam: ',
      zh: '其他背景：',
      ja: '追加のコンテキスト：',
      hi: 'अतिरिक्त संदर्भ: ',
      nl: 'Aanvullende context: '
    };
    
    const intro = intros[language || 'en'] || intros.en;
    const facts = memories.map(m => m.content).join('. ');
    
    return intro + facts + '.\n\n';
  }
  
  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Truncate context to fit token limit
   */
  truncateToTokenLimit(context: string): string {
    const estimated = this.estimateTokens(context);
    
    if (estimated <= this.config.maxTokens) {
      return context;
    }
    
    // Calculate what percentage to keep
    const keepRatio = this.config.maxTokens / estimated;
    const targetLength = Math.floor(context.length * keepRatio * 0.95); // 95% to be safe
    
    // Try to truncate at a sentence boundary
    let truncated = context.substring(0, targetLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    
    const cutPoint = Math.max(lastPeriod, lastNewline);
    if (cutPoint > targetLength * 0.8) {
      truncated = truncated.substring(0, cutPoint + 1);
    }
    
    return truncated + '\n[... context truncated]';
  }
  
  /**
   * Build complete context with token limit
   */
  buildCompactContext(
    memories: StoredMemory[],
    language?: string,
    additionalContext?: string
  ): string {
    let context = this.buildContext(memories, language);
    
    if (additionalContext) {
      context += '\n\n' + additionalContext;
    }
    
    return this.truncateToTokenLimit(context);
  }
}