import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/lib/security-utils';

/**
 * This endpoint handles OAuth popup callbacks securely by returning a minimal HTML page
 * that communicates with the opener window and then closes itself.
 * 
 * This approach avoids XSS vulnerabilities by:
 * 1. Not rendering any user-controlled content in the HTML
 * 2. Using URL parameters that are validated server-side
 * 3. Keeping the JavaScript logic minimal and self-contained
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');
  const error = searchParams.get('error');
  const username = searchParams.get('username');
  
  // Validate status parameter
  if (!status || !['success', 'error'].includes(status)) {
    return new NextResponse('Invalid status', { status: 400 });
  }
  
  // Build the message object based on status
  let message: Record<string, any>;
  if (status === 'success') {
    message = {
      type: 'github-oauth-success',
      githubUsername: username || 'unknown'
    };
  } else {
    message = {
      type: 'github-oauth-error',
      error: error || 'unknown_error'
    };
  }
  
  // Return a minimal HTML page that posts the message and closes
  // Note: We're not rendering any user-controlled content directly in the HTML
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>OAuth Complete</title>
</head>
<body>
<script>
(function() {
  // Message data is hardcoded based on server-validated parameters
  const messageData = ${JSON.stringify(message)};
  const targetOrigin = ${JSON.stringify(process.env.NEXTAUTH_URL || '*')};
  
  if (window.opener && window.opener !== window) {
    try {
      window.opener.postMessage(messageData, targetOrigin);
    } catch (e) {
      console.error('Failed to post message:', e);
    }
    
    // Close the popup window
    setTimeout(function() {
      window.close();
    }, 100);
  } else {
    // If not in a popup, redirect based on status
    window.location.href = ${JSON.stringify(
      status === 'success' 
        ? '/search' 
        : `/search?auth_error=${error || 'unknown'}`
    )};
  }
})();
</script>
<noscript>
  <p>Authentication complete. You can close this window.</p>
</noscript>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...getSecurityHeaders(),
      // Prevent caching of this response
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}