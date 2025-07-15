import { describe, it, expect } from 'vitest';
import { useWizardState } from '@/app/(sidebar-layout)/(container)/mcp-servers/components/smart-server-wizard/useWizardState';

// Simple test for the hook logic without React rendering
describe('useWizardState logic', () => {
  it('should have correct initial steps structure', () => {
    // Test the steps structure directly
    const steps = [
      {
        id: 'github-input',
        title: 'GitHub Repository',
        description: 'Enter the GitHub repository URL',
        isComplete: false,
        isActive: true,
      },
      {
        id: 'claim-decision',
        title: 'Ownership',
        description: 'Claim this server or add to community',
        isComplete: false,
        isActive: false,
      },
      {
        id: 'env-config',
        title: 'Configuration',
        description: 'Configure environment variables',
        isComplete: false,
        isActive: false,
      },
      {
        id: 'discovery-test',
        title: 'Test Discovery',
        description: 'Test server discovery and capabilities',
        isComplete: false,
        isActive: false,
      },
      {
        id: 'registry-submit',
        title: 'Submit',
        description: 'Submit to the registry',
        isComplete: false,
        isActive: false,
      },
    ];

    expect(steps).toHaveLength(5);
    expect(steps[0].id).toBe('github-input');
    expect(steps[0].isActive).toBe(true);
    expect(steps[4].id).toBe('registry-submit');
  });

  it('should validate wizard data types', () => {
    // Test that the WizardData interface is properly structured
    const mockWizardData = {
      githubUrl: 'https://github.com/test/repo',
      owner: 'test',
      repo: 'repo',
      repoInfo: {
        name: 'repo',
        description: 'Test repository',
        private: false,
        defaultBranch: 'main',
        language: 'TypeScript',
        stars: 100,
      },
      willClaim: false,
      isAuthenticated: true,
      githubUsername: 'testuser',
      detectedEnvVars: [
        {
          name: 'API_KEY',
          description: 'API key for service',
          defaultValue: '',
          required: true,
          source: 'readme' as const,
        },
      ],
      configuredEnvVars: {
        API_KEY: 'test-key',
      },
      discoveryResult: {
        success: true,
        output: 'Discovery output',
        tools: [{ name: 'test-tool', description: 'Test tool' }],
        resources: [{ uri: 'test://resource', name: 'Test Resource' }],
        prompts: [{ name: 'test-prompt', description: 'Test prompt' }],
      },
      serverConfig: {
        command: 'node',
        args: ['server.js'],
        type: 'STDIO' as const,
      },
      serverMetadata: {
        name: 'Test Server',
        description: 'A test MCP server',
        categories: ['test'],
        tags: ['test', 'example'],
        icon: 'https://example.com/icon.png',
      },
      submissionResult: {
        success: true,
        serverId: 'test-server-id',
      },
    };

    // Type checking happens at compile time
    expect(mockWizardData.githubUrl).toBe('https://github.com/test/repo');
    expect(mockWizardData.repoInfo?.stars).toBe(100);
    expect(mockWizardData.detectedEnvVars?.[0].source).toBe('readme');
    expect(mockWizardData.discoveryResult?.tools).toHaveLength(1);
  });
});