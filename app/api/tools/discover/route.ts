import { exec } from 'child_process';
import { NextResponse } from 'next/server';
import path from 'path';
import { promisify } from 'util';

import { authenticateApiKey } from '../../auth'; // Adjust the path based on your actual auth file location

const execAsync = promisify(exec);

/**
 * @swagger
 * /api/tools/discover:
 *   post:
 *     summary: Trigger tool discovery and reporting process
 *     description: Initiates the discovery of tools from configured MCP servers via an external script and reports them back to the application database. Requires API key authentication.
 *     tags:
 *       - Tools
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Tool discovery and reporting process completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tool discovery and reporting completed successfully
 *                 details:
 *                   type: string
 *                   description: Standard output from the discovery script.
 *                   example: "Discovering tools...\nReported 5 tools."
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 *       500:
 *         description: Internal Server Error - Failed to execute the discovery script or other server-side issue.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Error executing tool discovery script
 *                 details:
 *                   type: string
 *                   description: Standard error output or error message from the script execution.
 *                   example: "Error: Script not found at path..."
 *                 stdout:
 *                   type: string
 *                   description: Standard output from the script before the error occurred (if any).
 */
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

      // Enhanced error details
      let errorDetails = stderr || execError.message;
      const statusCode = 500; // Use const as it's not reassigned

      if (execError.message.includes('ENOENT') || execError.code === 'ENOENT') {
         errorDetails = `Script not found at path: ${scriptPath}. Please check server configuration.`;
         console.error(errorDetails); // Log specific error
      } else if (execError.message.includes('permission denied') || execError.code === 'EACCES') {
         errorDetails = `Permission denied when trying to execute script: ${scriptPath}. Check file permissions.`;
         console.error(errorDetails); // Log specific error
      } else if (execError.code) {
         // Include exit code if available
         errorDetails = `Script exited with code ${execError.code}. Stderr: ${stderr || 'N/A'}. Error: ${execError.message}`;
      }

      return NextResponse.json(
        {
          error: 'Error executing tool discovery script',
          details: errorDetails, // Provide more specific details
          stdout: stdout, // Include stdout for context
        },
        { status: statusCode } // Use potentially adjusted status code
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
