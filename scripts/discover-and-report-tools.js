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

async function main() {
  let reportAllTools;
  try {
    // Attempt to import from a potential node_modules location or linked workspace
    const module1 = await import('pluggedin-mcp/dist/report-tools.js');
    reportAllTools = module1.reportAllTools;
  } catch (e1) {
    console.warn("Could not import 'pluggedin-mcp/dist/report-tools.js'. Trying relative path...");
    try {
      // Fallback for potentially different structures (e.g., monorepo sibling)
      // This path is highly dependent on the actual project layout.
      // Using file URL for relative dynamic import
      const relativePath = '../../pluggedin-mcp/dist/report-tools.js';
      const modulePath = new URL(relativePath, import.meta.url).pathname;
      const module2 = await import(modulePath);
      reportAllTools = module2.reportAllTools;
    } catch (e2) {
      console.error("Failed to import reportAllTools function from pluggedin-mcp.");
      console.error("Ensure pluggedin-mcp is built and accessible from pluggedin-app/scripts.");
      console.error("Error 1:", e1.message);
      console.error("Error 2:", e2.message);
      process.exit(1);
    }
  }

  if (typeof reportAllTools !== 'function') {
    console.error("reportAllTools was imported but is not a function. Check the export in pluggedin-mcp.");
    process.exit(1);
  }

  console.log('Starting tool discovery and reporting process via pluggedin-mcp...');

  // Make sure environment variables needed by pluggedin-mcp are set
  // (PLUGGEDIN_API_KEY, PLUGGEDIN_API_BASE_URL)
  // These might need to be loaded from pluggedin-app's environment.
  // Consider using a library like dotenv if needed.

  try {
    await reportAllTools();
    console.log('Tool discovery and reporting completed successfully.');
    // process.exit(0); // reportAllTools should not exit anymore
  } catch (error) {
    console.error('Error during tool discovery and reporting:', error);
    // Re-throw the error so the calling process (execAsync) knows it failed
    throw error; 
  }
}

main();
