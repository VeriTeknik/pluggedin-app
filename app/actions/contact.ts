'use server';

import { z } from 'zod';

import { sendEmail } from '@/lib/email';

const contactFormSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

export type ContactFormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export async function submitContactForm(data: ContactFormData) {
  try {
    // Validate input
    const validated = contactFormSchema.parse(data);
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