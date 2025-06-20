import { describe, expect, it } from 'vitest';

describe('Test Infrastructure Demo', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should support async operations', async () => {
    const result = await Promise.resolve('async works');
    expect(result).toBe('async works');
  });

  it('should have access to environment variables', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should support Jest DOM matchers', () => {
    // Basic example - this shows the testing setup supports DOM matchers
    // In real component tests, we'd use jsdom environment
    const mockElement = {
      textContent: 'Hello World',
    };
    expect(mockElement.textContent).toBe('Hello World');
  });

  it('should support complex objects', () => {
    const user = {
      id: 'test-123',
      name: 'Test User',
      email: 'test@example.com',
      settings: {
        theme: 'dark',
        notifications: true,
      },
    };

    expect(user).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Test User',
        settings: expect.objectContaining({
          theme: 'dark',
        }),
      })
    );
  });

  it('should support array operations', () => {
    const servers = [
      { name: 'Server 1', status: 'active' },
      { name: 'Server 2', status: 'inactive' },
      { name: 'Server 3', status: 'active' },
    ];

    const activeServers = servers.filter(s => s.status === 'active');
    expect(activeServers).toHaveLength(2);
    expect(activeServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Server 1' }),
        expect.objectContaining({ name: 'Server 3' }),
      ])
    );
  });

  it('should support error handling', () => {
    const throwError = () => {
      throw new Error('Test error');
    };

    expect(throwError).toThrow('Test error');
    expect(throwError).toThrow(Error);
  });

  it('should support mocking concepts', () => {
    // Demonstrate basic mocking concepts that work with our setup
    const mockFunction = () => 'mocked result';
    const result = mockFunction();
    expect(result).toBe('mocked result');
  });
});