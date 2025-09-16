import { z } from 'zod';

export const supportedLanguages = ['en', 'tr', 'zh', 'hi', 'ja', 'nl'] as const;
export type SupportedLanguage = typeof supportedLanguages[number];

export const languageNames: Record<SupportedLanguage, string> = {
  en: 'English',
  tr: 'Türkçe',
  zh: '中文',
  hi: 'हिन्दी',
  ja: '日本語',
  nl: 'Nederlands',
};

export interface TranslationResult {
  language: SupportedLanguage;
  subject: string;
  content: string;
  success: boolean;
  error?: string;
}

export interface EmailTranslations {
  original: {
    language: SupportedLanguage;
    subject: string;
    content: string;
  };
  translations: TranslationResult[];
}

const translationPrompt = (
  subject: string,
  content: string,
  fromLang: string,
  toLang: string,
  langName: string
) => `Translate the following email from ${fromLang} to ${langName} (${toLang}).
Maintain the tone, formatting, and any HTML tags present in the original.
Return ONLY the translated content in JSON format with "subject" and "content" fields.

Original Subject: ${subject}

Original Content:
${content}

Respond with JSON only, no additional text:`;

// Configuration for retry logic
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 5000, // 5 seconds
  backoffMultiplier: 2,
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T | null>,
  retryConfig = RETRY_CONFIG
): Promise<T | null> {
  let lastError: Error | null = null;
  let delay = retryConfig.initialDelay;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const result = await fn();
      if (result !== null) {
        return result;
      }
      // If result is null but no error, don't retry
      if (attempt === 0) {
        return null;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < retryConfig.maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelay);
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

export async function translateEmail(
  subject: string,
  content: string,
  fromLanguage: SupportedLanguage,
  toLanguage: SupportedLanguage
): Promise<TranslationResult> {
  // Skip if translating to same language
  if (fromLanguage === toLanguage) {
    return {
      language: toLanguage,
      subject,
      content,
      success: true,
    };
  }

  try {
    // Try different AI providers based on what's available in env
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;

    let result: { subject: string; content: string } | null = null;
    const errors: string[] = [];

    // Try providers in order of preference with retry logic
    if (anthropicKey) {
      try {
        result = await withRetry(() =>
          translateWithAnthropic(
            subject,
            content,
            fromLanguage,
            toLanguage,
            anthropicKey
          )
        );
        if (result) {
          return {
            language: toLanguage,
            subject: result.subject,
            content: result.content,
            success: true,
          };
        }
      } catch (error) {
        errors.push(`Anthropic: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (openaiKey && !result) {
      try {
        result = await withRetry(() =>
          translateWithOpenAI(
            subject,
            content,
            fromLanguage,
            toLanguage,
            openaiKey
          )
        );
        if (result) {
          return {
            language: toLanguage,
            subject: result.subject,
            content: result.content,
            success: true,
          };
        }
      } catch (error) {
        errors.push(`OpenAI: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (googleKey && !result) {
      try {
        result = await withRetry(() =>
          translateWithGoogle(
            subject,
            content,
            fromLanguage,
            toLanguage,
            googleKey
          )
        );
        if (result) {
          return {
            language: toLanguage,
            subject: result.subject,
            content: result.content,
            success: true,
          };
        }
      } catch (error) {
        errors.push(`Google: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (!anthropicKey && !openaiKey && !googleKey) {
      throw new Error('No AI API keys configured for translation');
    }

    if (!result) {
      const errorMessage = errors.length > 0
        ? `All providers failed: ${errors.join('; ')}`
        : 'Translation failed with no specific error';
      throw new Error(errorMessage);
    }

    return {
      language: toLanguage,
      subject: result.subject,
      content: result.content,
      success: true,
    };
  } catch (error) {
    console.error(`Translation error for ${toLanguage}:`, error);
    return {
      language: toLanguage,
      subject,
      content,
      success: false,
      error: error instanceof Error ? error.message : 'Translation failed',
    };
  }
}

async function translateWithAnthropic(
  subject: string,
  content: string,
  fromLang: SupportedLanguage,
  toLang: SupportedLanguage,
  apiKey: string
): Promise<{ subject: string; content: string } | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: translationPrompt(
              subject,
              content,
              languageNames[fromLang],
              toLang,
              languageNames[toLang]
            ),
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.content[0].text);
    return result;
  } catch (error) {
    console.error('Anthropic translation error:', error);
    return null;
  }
}

async function translateWithOpenAI(
  subject: string,
  content: string,
  fromLang: SupportedLanguage,
  toLang: SupportedLanguage,
  apiKey: string
): Promise<{ subject: string; content: string } | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: translationPrompt(
              subject,
              content,
              languageNames[fromLang],
              toLang,
              languageNames[toLang]
            ),
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('OpenAI translation error:', error);
    return null;
  }
}

async function translateWithGoogle(
  subject: string,
  content: string,
  fromLang: SupportedLanguage,
  toLang: SupportedLanguage,
  apiKey: string
): Promise<{ subject: string; content: string } | null> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: translationPrompt(
                    subject,
                    content,
                    languageNames[fromLang],
                    toLang,
                    languageNames[toLang]
                  ),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4000,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.statusText}`);
    }

    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    const result = JSON.parse(resultText);
    return result;
  } catch (error) {
    console.error('Google translation error:', error);
    return null;
  }
}

export async function translateToAllLanguages(
  subject: string,
  content: string,
  sourceLanguage: SupportedLanguage = 'en'
): Promise<EmailTranslations> {
  const translations: TranslationResult[] = [];

  // Translate to all languages except the source
  const targetLanguages = supportedLanguages.filter(lang => lang !== sourceLanguage);

  // Process translations in parallel for better performance
  const translationPromises = targetLanguages.map(lang =>
    translateEmail(subject, content, sourceLanguage, lang)
  );

  const results = await Promise.all(translationPromises);

  // Check for failed translations and retry them sequentially with longer delays
  const failedTranslations = results.filter(r => !r.success);
  if (failedTranslations.length > 0) {
    console.warn(`${failedTranslations.length} translations failed, attempting sequential retry...`);

    for (const failed of failedTranslations) {
      // Wait a bit before retrying to avoid rate limits
      await sleep(2000);

      const retryResult = await translateEmail(
        subject,
        content,
        sourceLanguage,
        failed.language
      );

      // Replace the failed result with the retry result
      const index = results.findIndex(r => r.language === failed.language);
      if (index !== -1) {
        results[index] = retryResult;
      }
    }
  }

  translations.push(...results);

  // Add the original as well
  translations.unshift({
    language: sourceLanguage,
    subject,
    content,
    success: true,
  });

  // Log summary of translation results
  const successCount = translations.filter(t => t.success).length;
  const totalCount = translations.length;
  console.log(`Translation summary: ${successCount}/${totalCount} successful`);

  if (successCount < totalCount) {
    const failedLangs = translations
      .filter(t => !t.success)
      .map(t => languageNames[t.language])
      .join(', ');
    console.warn(`Failed languages: ${failedLangs}`);
  }

  return {
    original: {
      language: sourceLanguage,
      subject,
      content,
    },
    translations,
  };
}