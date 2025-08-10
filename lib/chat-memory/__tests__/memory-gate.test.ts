import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  memoryGate, 
  embeddingGate,
  cosineSimilarity,
  shouldSkipGate,
  type GateContext 
} from '../memory-gate';

describe('Memory Gate', () => {
  describe('Embedding Gate (Fallback Mode)', () => {
    it('should remember messages with email indicators', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'My email is john@example.com',
        assistantMessage: 'Got it, I\'ll use john@example.com'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
      expect(decision.reason).toContain('memory indicators');
    });
    
    it('should remember messages with decision indicators', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'Let\'s use PostgreSQL for the database',
        assistantMessage: 'Alright, we\'ve decided to use PostgreSQL'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
    });
    
    it('should not remember small talk', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'Hello, how are you?',
        assistantMessage: 'I\'m doing well, thank you!'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(false);
      expect(decision.reason).toContain('No memory indicators');
    });
    
    it('should detect potential duplicates', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'My email is john@example.com',
        assistantMessage: 'Got it',
        existingMemories: ['user_email: john@example.com']
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(false);
      expect(decision.reason).toContain('duplicate');
    });
    
    it('should handle ticket numbers', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'I created ticket #12345',
        assistantMessage: 'I see ticket #12345 has been created'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
    });
    
    it('should handle URLs', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'The API endpoint is https://api.example.com/v1',
        assistantMessage: 'I\'ll use that endpoint'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
    });
  });
  
  describe('Main Gate Function', () => {
    it('should reject very short messages', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'OK'
      };
      
      const decision = await memoryGate(context);
      
      expect(decision.remember).toBe(false);
      expect(decision.reason).toContain('too short');
    });
    
    it('should reject empty messages', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: ''
      };
      
      const decision = await memoryGate(context);
      
      expect(decision.remember).toBe(false);
      expect(decision.reason).toContain('No user message');
    });
    
    it('should use embedding mode when specified', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'My phone number is 555-1234'
      };
      
      const decision = await memoryGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
    });
  });
  
  describe('Cosine Similarity', () => {
    it('should calculate similarity correctly', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      
      expect(cosineSimilarity(a, b)).toBe(1); // Identical vectors
    });
    
    it('should handle orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      
      expect(cosineSimilarity(a, b)).toBe(0); // Orthogonal
    });
    
    it('should handle opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      
      expect(cosineSimilarity(a, b)).toBe(-1); // Opposite
    });
    
    it('should handle zero vectors', () => {
      const a = [0, 0];
      const b = [1, 1];
      
      expect(cosineSimilarity(a, b)).toBe(0);
    });
    
    it('should throw on mismatched lengths', () => {
      const a = [1, 2];
      const b = [1, 2, 3];
      
      expect(() => cosineSimilarity(a, b)).toThrow('same length');
    });
  });
  
  describe('Skip Gate Logic', () => {
    it('should skip gate for tool outputs', () => {
      expect(shouldSkipGate(false, true)).toBe(true);
    });
    
    it('should skip gate when artifacts detected', () => {
      expect(shouldSkipGate(true, false)).toBe(true);
    });
    
    it('should not skip gate for regular messages', () => {
      expect(shouldSkipGate(false, false)).toBe(false);
    });
    
    it('should skip gate for both artifacts and tool output', () => {
      expect(shouldSkipGate(true, true)).toBe(true);
    });
  });
  
  describe('Multilingual Support', () => {
    it('should handle Turkish text with memory indicators', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'Benim e-postam ali@sirket.com.tr',
        assistantMessage: 'Tamam, ali@sirket.com.tr kullanacağım'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
    });
    
    it('should handle Chinese text with memory indicators', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: '我的邮箱是 zhang@company.cn',
        assistantMessage: '好的，我会使用 zhang@company.cn'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
    });
    
    it('should handle Japanese text with memory indicators', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: '私のメールは tanaka@会社.jp です',
        assistantMessage: 'わかりました、tanaka@会社.jp を使います'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
    });
    
    it('should handle Dutch text with memory indicators', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'Mijn e-mailadres is jan@bedrijf.nl',
        assistantMessage: 'Begrepen, ik zal jan@bedrijf.nl gebruiken'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
    });
    
    it('should handle Hindi text with memory indicators', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'मेरा ईमेल raj@company.in है',
        assistantMessage: 'ठीक है, मैं raj@company.in का उपयोग करूंगा'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      expect(decision.remember).toBe(true);
    });
  });
  
  describe('Context Handling', () => {
    it('should consider conversation summary', async () => {
      const context: GateContext = {
        conversationSummary: 'User is setting up a database connection',
        userMessage: 'Use port 5432',
        assistantMessage: 'Port 5432 configured'
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      // With context, this becomes more likely to be remembered
      expect(decision.confidence).toBeGreaterThanOrEqual(0.7);
    });
    
    it('should check against existing memories', async () => {
      const context: GateContext = {
        conversationSummary: '',
        userMessage: 'Remember my name is John',
        assistantMessage: 'Got it, John',
        existingMemories: ['user_name: John', 'user_email: john@example.com']
      };
      
      const decision = await embeddingGate(context, { mode: 'embedding' });
      
      // Should detect this is likely duplicate
      expect(decision.remember).toBe(false);
    });
  });
});