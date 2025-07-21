import { NextResponse } from 'next/server';

import { encodeForJavaScript, getSecurityHeaders,sanitizeErrorMessage } from '@/lib/security-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get('error');
  
  // Prepare message data
  const messageData = {
    type: error ? 'github-auth-error' : 'github-auth-success',
    error: error ? sanitizeErrorMessage(error) : null
  };
  
  // Generate the HTML response that will communicate with the parent window
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>GitHub Authentication</title>
      </head>
      <body>
        <script>
          // Check if we're in a popup
          if (window.opener) {
            // Send message to parent window
            window.opener.postMessage(${encodeForJavaScript(messageData)}, window.location.origin);
            
            // Close the popup
            window.close();
          } else {
            // If not in a popup, redirect to search page
            window.location.href = '/search';
          }
        </script>
        <p>Authentication complete. This window should close automatically...</p>
      </body>
    </html>
  `;
  
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      ...getSecurityHeaders()
    },
  });
}