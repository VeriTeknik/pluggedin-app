import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  translateEmail,
  translateToAllLanguages,
  supportedLanguages,
  languageNames,
  type SupportedLanguage,
  type EmailTranslations,
} from '@/lib/email-translation-service';

// Mock fetch globally
global.fetch = vi.fn();

describe('Email Translation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    process.env.ANTHROPIC_API_KEY = '';
    process.env.OPENAI_API_KEY = '';
    process.env.GOOGLE_API_KEY = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('translateEmail', () => {
    it('should return original content when translating to same language', async () => {
      const result = await translateEmail(
        'Test Subject',
        'Test Content',
        'en',
        'en'
      );

      expect(result).toEqual({
        language: 'en',
        subject: 'Test Subject',
        content: 'Test Content',
        success: true,
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should use Anthropic API when available', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const mockResponse = {
        content: [{ text: JSON.stringify({ subject: 'Sujet Test', content: 'Contenu Test' }) }],
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await translateEmail(
        'Test Subject',
        'Test Content',
        'en',
        'fr' as SupportedLanguage
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-anthropic-key',
          }),
        })
      );

      expect(result.success).toBe(true);
      expect(result.subject).toBe('Sujet Test');
      expect(result.content).toBe('Contenu Test');
    });

    it('should use OpenAI API when Anthropic is not available', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({ subject: 'Onderwerp Test', content: 'Inhoud Test' }),
          },
        }],
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await translateEmail(
        'Test Subject',
        'Test Content',
        'en',
        'nl'
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-openai-key',
          }),
        })
      );

      expect(result.success).toBe(true);
      expect(result.subject).toBe('Onderwerp Test');
      expect(result.content).toBe('Inhoud Test');
    });

    it('should use Google API as fallback', async () => {
      process.env.GOOGLE_API_KEY = 'test-google-key';

      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ subject: '测试主题', content: '测试内容' }),
            }],
          },
        }],
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await translateEmail(
        'Test Subject',
        'Test Content',
        'en',
        'zh'
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
        })
      );

      expect(result.success).toBe(true);
      expect(result.subject).toBe('测试主题');
      expect(result.content).toBe('测试内容');
    });

    it('should handle API errors gracefully', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      const result = await translateEmail(
        'Test Subject',
        'Test Content',
        'en',
        'ja'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Translation failed');
      expect(result.language).toBe('ja');
      // Should return original content on failure
      expect(result.subject).toBe('Test Subject');
      expect(result.content).toBe('Test Content');
    });

    it('should return error when no API keys are configured', async () => {
      const result = await translateEmail(
        'Test Subject',
        'Test Content',
        'en',
        'hi'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No AI API keys configured for translation');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle malformed API responses', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ text: 'invalid json' }] }),
      });

      const result = await translateEmail(
        'Test Subject',
        'Test Content',
        'en',
        'tr'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Translation failed');
    });
  });

  describe('translateToAllLanguages', () => {
    it('should translate to all supported languages', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      // Mock successful translations for each language
      const translations = {
        tr: { subject: 'Türkçe Konu', content: 'Türkçe İçerik' },
        zh: { subject: '中文主题', content: '中文内容' },
        hi: { subject: 'हिंदी विषय', content: 'हिंदी सामग्री' },
        ja: { subject: '日本語の件名', content: '日本語の内容' },
        nl: { subject: 'Nederlands Onderwerp', content: 'Nederlandse Inhoud' },
      };

      let callCount = 0;
      (fetch as any).mockImplementation(async () => {
        const langs = Object.keys(translations);
        const lang = langs[callCount++];
        return {
          ok: true,
          json: async () => ({
            content: [{ text: JSON.stringify(translations[lang as keyof typeof translations]) }],
          }),
        };
      });

      const result = await translateToAllLanguages(
        'Test Subject',
        'Test Content',
        'en'
      );

      expect(result.original).toEqual({
        language: 'en',
        subject: 'Test Subject',
        content: 'Test Content',
      });

      expect(result.translations).toHaveLength(6); // All languages including original
      expect(result.translations[0]).toEqual({
        language: 'en',
        subject: 'Test Subject',
        content: 'Test Content',
        success: true,
      });

      // Check Turkish translation
      const turkishTranslation = result.translations.find(t => t.language === 'tr');
      expect(turkishTranslation).toEqual({
        language: 'tr',
        subject: 'Türkçe Konu',
        content: 'Türkçe İçerik',
        success: true,
      });

      // Should have called API 5 times (all languages except source)
      expect(fetch).toHaveBeenCalledTimes(5);
    });

    it('should handle partial translation failures', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      let callCount = 0;
      (fetch as any).mockImplementation(async () => {
        callCount++;
        // Fail on the 3rd call
        if (callCount === 3) {
          return {
            ok: false,
            statusText: 'Rate Limited',
          };
        }
        return {
          ok: true,
          json: async () => ({
            content: [{ text: JSON.stringify({ subject: `Translated ${callCount}`, content: `Content ${callCount}` }) }],
          }),
        };
      });

      const result = await translateToAllLanguages(
        'Test Subject',
        'Test Content',
        'en'
      );

      // Should still return all translations, some with success=false
      expect(result.translations).toHaveLength(6);

      const failedTranslations = result.translations.filter(t => !t.success);
      expect(failedTranslations).toHaveLength(1);
      expect(failedTranslations[0].error).toBe('Translation failed');
    });

    it('should process translations in parallel', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const startTime = Date.now();
      const delays = [100, 100, 100, 100, 100]; // 5 translations with 100ms each
      let callIndex = 0;

      (fetch as any).mockImplementation(async () => {
        const delay = delays[callIndex++];
        await new Promise(resolve => setTimeout(resolve, delay));
        return {
          ok: true,
          json: async () => ({
            content: [{ text: JSON.stringify({ subject: 'Translated', content: 'Content' }) }],
          }),
        };
      });

      await translateToAllLanguages('Subject', 'Content', 'en');

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // If translations were sequential, it would take ~500ms
      // In parallel, should be close to 100ms (plus overhead)
      expect(totalTime).toBeLessThan(200);
      expect(fetch).toHaveBeenCalledTimes(5);
    });

    it('should use specified source language', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      (fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ text: JSON.stringify({ subject: 'Translated', content: 'Content' }) }],
        }),
      });

      const result = await translateToAllLanguages(
        'Test Subject',
        'Test Content',
        'zh'
      );

      expect(result.original.language).toBe('zh');
      // Should translate to all languages except Chinese
      expect(fetch).toHaveBeenCalledTimes(5);

      // Chinese should be the original (first in array)
      expect(result.translations[0]).toEqual({
        language: 'zh',
        subject: 'Test Subject',
        content: 'Test Content',
        success: true,
      });
    });
  });

  describe('Configuration', () => {
    it('should export all supported languages', () => {
      expect(supportedLanguages).toEqual(['en', 'tr', 'zh', 'hi', 'ja', 'nl']);
    });

    it('should export language names mapping', () => {
      expect(languageNames).toEqual({
        en: 'English',
        tr: 'Türkçe',
        zh: '中文',
        hi: 'हिन्दी',
        ja: '日本語',
        nl: 'Nederlands',
      });
    });
  });

  describe('API Provider Fallback', () => {
    it('should fallback from Anthropic to OpenAI', async () => {
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      process.env.OPENAI_API_KEY = 'openai-key';

      // First call to Anthropic fails
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Service Unavailable',
      });

      // OpenAI should not be called since Anthropic is the primary
      const result = await translateEmail('Subject', 'Content', 'en', 'ja');

      expect(result.success).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.any(Object)
      );
    });

    it('should use OpenAI when Anthropic key is not available', async () => {
      process.env.OPENAI_API_KEY = 'openai-key';

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ subject: 'Translated', content: 'Content' }),
            },
          }],
        }),
      });

      const result = await translateEmail('Subject', 'Content', 'en', 'ja');

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.any(Object)
      );
    });
  });
});