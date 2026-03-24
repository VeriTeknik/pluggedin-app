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
  website: z.string().max(0).optional(), // honeypot - must be empty
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
 * Returns true if the text looks like spam.
 */
function looksLikeSpam(text: string): boolean {
  // High ratio of uppercase letters in a mixed-case string
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 5) {
    const uppercaseRatio = (letters.replace(/[^A-Z]/g, '').length) / letters.length;
    // Random strings tend to have ~50% uppercase; normal text is <20%
    if (uppercaseRatio > 0.4 && uppercaseRatio < 0.7) return true;
  }

  // Very low vowel ratio indicates random character strings
  if (letters.length > 5) {
    const vowels = letters.replace(/[^aeiouAEIOU]/g, '').length;
    const vowelRatio = vowels / letters.length;
    if (vowelRatio < 0.15) return true;
  }

  return false;
}

export async function submitContactForm(data: ContactFormData) {
  try {
    // Honeypot check - bots fill hidden fields
    if (data.website) {
      // Silently succeed to not reveal detection to bots
      return { success: true };
    }

    // Rate limit: 3 submissions per hour per IP
    const headersList = await headers();
    const forwarded = headersList.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0] || headersList.get('x-real-ip') || 'unknown';
    const rateCheck = await rateLimiter.check(`contact:${ip}`, 3, 3600);
    if (!rateCheck.success) {
      return { success: false, error: 'Too many submissions. Please try again later.' };
    }

    // Validate input
    const validated = contactFormSchema.parse(data);

    // Spam content check
    if (looksLikeSpam(validated.name) || looksLikeSpam(validated.subject) || looksLikeSpam(validated.message)) {
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