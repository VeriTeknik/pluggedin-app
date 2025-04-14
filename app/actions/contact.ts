'use server';

import { sendEmail } from '@/lib/email';

export type ContactFormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export async function submitContactForm(data: ContactFormData) {
  try {
    const { name, email, subject, message } = data;

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