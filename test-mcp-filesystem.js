// Test with a real MCP server package that exists in npm
import { packageManager } from './lib/mcp/package-manager/index.js';

async function testFileSystemServer() {
  console.log('Testing Package Manager with @modelcontextprotocol/server-filesystem...\n');
  
  const testServerUuid = 'test-filesystem-' + Date.now();
  
  try {
    // Test with npx command (common pattern for MCP servers)
    console.log('Testing: npx @modelcontextprotocol/server-filesystem');
    const result = await packageManager.transformCommand(
      'npx',
      ['@modelcontextprotocol/server-filesystem', '/tmp'],
      testServerUuid
    );
    
    console.log('\n✅ Command transformation successful!');
    console.log('Original: npx @modelcontextprotocol/server-filesystem /tmp');
    console.log('Transformed:', result.command, result.args.join(' '));
    console.log('\nThe package has been installed to:', result.args[0]);
    
    // Also test node command pattern
    console.log('\n\nTesting: node @modelcontextprotocol/server-filesystem');
    const result2 = await packageManager.transformCommand(
      'node',
      ['@modelcontextprotocol/server-filesystem', '/tmp'],
      testServerUuid
    );
    
    console.log('✅ Node command transformation successful!');
    console.log('Transformed:', result2.command, result2.args.join(' '));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFileSystemServer();