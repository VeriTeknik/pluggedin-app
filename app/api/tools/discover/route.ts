import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { NextResponse } from 'next/server';

// Adjust the path based on your actual auth file location
import { authenticateApiKey } from '../../auth';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    // Path to the script relative to the project root (pluggedin-app)
    // process.cwd() should point to the root of the Next.js app
    const scriptPath = path.join(process.cwd(), 'scripts', 'discover-and-report-tools.js');

    console.log(`Attempting to execute script: ${scriptPath}`);

    // Execute the script using Node.js
    // Ensure the script has execute permissions if needed (chmod +x)
    // Pass necessary environment variables if the script relies on them
    // and they aren't automatically inherited.
    // Quote the script path to handle spaces
    const command = `node "${scriptPath}"`;
    let stdout = '';
    let stderr = '';

    try {
      const execResult = await execAsync(command, {
        // Pass environment variables from the API route to the script if necessary
        // env: {
      //   ...process.env, // Inherit existing env vars
      //   PLUGGEDIN_API_KEY: 'value_if_needed', // Example
      //   PLUGGEDIN_API_BASE_URL: 'value_if_needed', // Example
        // },
      });
      stdout = execResult.stdout;
      stderr = execResult.stderr;

      console.log('Script stdout:', stdout);
      if (stderr) {
        // Log stderr as warnings if the command succeeded
        console.warn('Script executed with stderr output:', stderr);
      }

      // If execAsync succeeded, return success
      return NextResponse.json({
        success: true,
        message: 'Tool discovery and reporting completed successfully',
        details: stdout, // Include stdout for debugging/confirmation
      });

    } catch (execError: any) {
      // If execAsync failed (script exited with non-zero code or other error)
      console.error('Error executing tool discovery script:', execError);
      stdout = execError.stdout || stdout; // Capture any stdout before error
      stderr = execError.stderr || stderr; // Capture any stderr before error

      return NextResponse.json(
        {
          error: 'Error executing tool discovery script',
          details: stderr || execError.message, // Prioritize stderr, fallback to error message
          stdout: stdout, // Include stdout for context
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    // Catch errors from authenticateApiKey or other setup issues
    console.error('Error processing tool discovery request (setup):', error);
    return NextResponse.json(
      {
        error: 'Internal server error processing tool discovery request',
        details: error.message, // Include error message
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, // Include stack in dev
      },
      { status: 500 }
    );
  }
}
