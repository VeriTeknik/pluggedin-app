// Quick test script for package manager
import { packageManager } from './lib/mcp/package-manager/index.js';

async function testPackageManager() {
  console.log('Testing Package Manager with MCP Wikidata...\n');
  
  const testServerUuid = 'test-' + Date.now();
  
  try {
    // Test command transformation
    const result = await packageManager.transformCommand(
      'npx',
      ['mcp-wikidata'],
      testServerUuid
    );
    
    console.log('✅ Command transformation successful!');
    console.log('Original: npx mcp-wikidata');
    console.log('Transformed:', result.command, result.args.join(' '));
    console.log('Environment:', result.env);
    
    // Check if package was installed
    const handler = packageManager.getHandler('npm');
    const isInstalled = await handler.isInstalled(testServerUuid, 'mcp-wikidata');
    console.log('\n✅ Package installed:', isInstalled);
    
    // Get disk usage
    const diskUsage = await packageManager.getServerDiskUsage(testServerUuid);
    console.log('Disk usage:', (diskUsage / 1024 / 1024).toFixed(2), 'MB');
    
    // Cleanup
    console.log('\nCleaning up test installation...');
    await packageManager.cleanupServer(testServerUuid);
    console.log('✅ Cleanup complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testPackageManager();