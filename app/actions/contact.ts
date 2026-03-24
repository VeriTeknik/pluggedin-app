'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { sendEmail } from '@/lib/email';
import { rateLimiter } from '@/lib/rate-limiter';

const contactFormSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
  website: z.string().optional(), // honeypot - checked before schema validation
});

export type ContactFormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
  website?: string; // honeypot field
};

/**
 * Detect gibberish/random strings typical of bot submissions.
 * Only applied to the message body (longer text) to avoid false positives
 * on short names, acronyms, or technical subjects.
 * Requires at least 20 letters and BOTH signals (abnormal case ratio AND low
 * vowel ratio) to flag as spam, reducing false positives on technical content.
 */
function looksLikeSpam(text: string): boolean {
  // Unicode-aware letter extraction (handles diacritics like José, Müller)
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 20) return false;

  // Check both signals — require both to reduce false positives on
  // technical content with acronyms (HTTP, API, DNS)
  const uppercaseRatio = (letters.replace(/[^\p{Lu}]/gu, '').length) / letters.length;
  const abnormalCase = uppercaseRatio > 0.4 && uppercaseRatio < 0.7;

  const vowels = letters.replace(/[^aeiouAEIOUàáâãäåèéêëìíîïòóôõöùúûüæœ]/gi, '').length;
  const lowVowelRatio = (vowels / letters.length) < 0.15;

  return abnormalCase && lowVowelRatio;
}

export async function submitContactForm(data: ContactFormData) {
  try {
    // Honeypot check - bots fill hidden fields
    if (data.website) {
      // Silently succeed to not reveal detection to bots
      return { success: true };
    }

    // Validate input first — don't consume rate limit quota on invalid submissions
    const validated = contactFormSchema.parse(data);

    // Rate limit: 3 submissions per hour per IP
    const headersList = await headers();
    const forwarded = headersList.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || headersList.get('x-real-ip')?.trim() || null;
    const userAgent = headersList.get('user-agent') || 'unknown-ua';
    const rateKey = ip ? `contact:ip:${ip}` : `contact:ua:${userAgent}`;
    const rateCheck = await rateLimiter.check(rateKey, 3, 3600);
    if (!rateCheck.success) {
      return { success: false, error: 'Too many submissions. Please try again later.' };
    }

    // Spam content check - only on message body to avoid false positives on short fields
    if (looksLikeSpam(validated.message)) {
      // Silently succeed to not reveal detection
      return { success: true };
    }
    const { name, email, subject, message } = validated;

    // Send email to configured recipients
    const recipients = [
      'cem.karaca@gmail.com',
      'emirolgun@gmail.com'
    ];

    const emailContent = `
      <h2>New Contact Form Submission</h2>
      <p><strong>From:</strong> ${name} (${email})</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p>${message}</p>
    `;

    // Send to all recipients
    const sendPromises = recipients.map(recipient => 
      sendEmail({
        to: recipient,
        subject: `Contact Form: ${subject}`,
        html: emailContent
      })
    );

    await Promise.all(sendPromises);
    return { success: true };
  } catch (error) {
    console.error('Error sending contact form email:', error);
    return { success: false, error: 'Failed to send message' };
  }
} 