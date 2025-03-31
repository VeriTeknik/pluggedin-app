#!/usr/bin/env node

// NOTE: This script is intended to be run from the pluggedin-app context,
// but it needs to execute logic from the pluggedin-mcp package.
// This setup is unusual and assumes pluggedin-mcp is installed as a dependency
// or linked appropriately (e.g., via pnpm workspace).

// Adjust the import path based on your project structure.
// If pluggedin-mcp is a workspace package, the path might be different.
// If it's installed, it might be 'pluggedin-mcp/dist/report-tools.js'.
// This assumes a structure where the script can access the built files of pluggedin-mcp.
// A more robust solution might involve calling the pluggedin-mcp executable directly
// or having pluggedin-mcp expose this as a library function.

import path from 'node:path'; // Import path module

async function main() {
  let reportAllCapabilities;
  const mcpDistPath = process.env.PLUGGEDIN_MCP_DIST_PATH; // Read path from env var

  if (!mcpDistPath) {
    console.error("Error: PLUGGEDIN_MCP_DIST_PATH environment variable is not set.");
    console.error("Please set this variable to the absolute path of the pluggedin-mcp/dist directory.");
    process.exit(1);
  }

  const reportToolsPath = path.join(mcpDistPath, 'report-tools.js'); // Construct full path

  try {
    // Import using the path constructed from the environment variable
    const mcpModule = await import(reportToolsPath); // Use different variable name
    reportAllCapabilities = mcpModule.reportAllCapabilities;
  } catch (e) {
    console.error(`Failed to import reportAllCapabilities function from ${reportToolsPath}.`);
    console.error("Ensure PLUGGEDIN_MCP_DIST_PATH is correct and pluggedin-mcp is built.");
    console.error("Error:", e.message);
    process.exit(1);
  }

  if (typeof reportAllCapabilities !== 'function') {
    console.error("reportAllCapabilities was imported but is not a function. Check the export in pluggedin-mcp."); // Updated error message
    process.exit(1);
  }

  console.log('Starting tool discovery and reporting process via pluggedin-mcp...');

  // Make sure environment variables needed by pluggedin-mcp are set
  // (PLUGGEDIN_API_KEY, PLUGGEDIN_API_BASE_URL)
  // These might need to be loaded from pluggedin-app's environment.
  // Consider using a library like dotenv if needed.

  try {
    await reportAllCapabilities(); // Call the correct function
    console.log('Capability discovery and reporting completed successfully.'); // Updated log message
    // process.exit(0); // reportAllCapabilities should not exit anymore
  } catch (error) {
    console.error('Error during capability discovery and reporting:', error); // Updated error message
    // Re-throw the error so the calling process (execAsync) knows it failed
    throw error; 
  }
}

main();
