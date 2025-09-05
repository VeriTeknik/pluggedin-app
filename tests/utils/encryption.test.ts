import { describe, it, expect, beforeAll } from 'vitest';
import { encryptField, decryptField, encryptServerData, decryptServerData } from '@/lib/encryption';

describe('Encryption', () => {
  beforeAll(() => {
    // Set the encryption key for testing
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = 'test-encryption-key-must-be-at-least-32-chars-long';
  });

  describe('encryptField and decryptField', () => {
    it('should encrypt and decrypt string data', () => {
      const originalData = 'sensitive-string-data';
      const encrypted = encryptField(originalData);
      
      // Encrypted data should be different from original
      expect(encrypted).not.toBe(originalData);
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
      
      // Decrypting should return original data
      const decrypted = decryptField(encrypted);
      expect(decrypted).toBe(originalData);
    });

    it('should encrypt and decrypt object data', () => {
      const originalData = { 
        key: 'value', 
        nested: { data: 'test' },
        array: [1, 2, 3]
      };
      const encrypted = encryptField(originalData);
      
      // Encrypted data should be a base64 string
      expect(typeof encrypted).toBe('string');
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
      
      // Decrypting should return original object
      const decrypted = decryptField(encrypted);
      expect(decrypted).toEqual(originalData);
    });

    it('should generate different encrypted values for same input (random salt)', () => {
      const data = 'test-data';
      const encrypted1 = encryptField(data);
      const encrypted2 = encryptField(data);
      
      // Due to random salt, encrypted values should be different
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same value
      expect(decryptField(encrypted1)).toBe(data);
      expect(decryptField(encrypted2)).toBe(data);
    });

    it('should throw error when decrypting invalid data', () => {
      expect(() => decryptField('invalid-base64-!@#')).toThrow('Failed to decrypt data');
    });

    it('should throw error when encryption key is not set', () => {
      const originalKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
      delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
      
      expect(() => encryptField('test')).toThrow('Encryption key not configured');
      expect(() => decryptField('test')).toThrow('Encryption key not configured');
      
      // Restore key
      process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = originalKey;
    });
  });

  describe('encryptServerData and decryptServerData', () => {
    it('should encrypt and decrypt server data', () => {
      const originalServer = {
        uuid: '123',
        name: 'test-server',
        command: '/usr/bin/node',
        args: ['--version'],
        env: { API_KEY: 'secret-key' },
        url: 'https://api.example.com'
      };
      
      const encrypted = encryptServerData(originalServer);
      
      // Check that sensitive fields are encrypted and removed
      expect(encrypted.command_encrypted).toBeDefined();
      expect(encrypted.args_encrypted).toBeDefined();
      expect(encrypted.env_encrypted).toBeDefined();
      expect(encrypted.url_encrypted).toBeDefined();
      expect(encrypted.command).toBeUndefined();
      expect(encrypted.args).toBeUndefined();
      expect(encrypted.env).toBeUndefined();
      expect(encrypted.url).toBeUndefined();
      
      // Non-sensitive fields should remain
      expect(encrypted.uuid).toBe('123');
      expect(encrypted.name).toBe('test-server');
      
      // Encryption version should be set
      expect(encrypted.encryption_version).toBe(2);
      
      // Decrypt the data
      const decrypted = decryptServerData(encrypted);
      
      // Should restore original sensitive fields
      expect(decrypted.command).toBe('/usr/bin/node');
      expect(decrypted.args).toEqual(['--version']);
      expect(decrypted.env).toEqual({ API_KEY: 'secret-key' });
      expect(decrypted.url).toBe('https://api.example.com');
      
      // Encrypted fields should be removed
      expect(decrypted.command_encrypted).toBeUndefined();
      expect(decrypted.args_encrypted).toBeUndefined();
      expect(decrypted.env_encrypted).toBeUndefined();
      expect(decrypted.url_encrypted).toBeUndefined();
    });

    it('should handle partial server data', () => {
      const serverWithOnlyCommand = {
        command: '/bin/bash'
      };
      
      const encrypted = encryptServerData(serverWithOnlyCommand);
      expect(encrypted.command_encrypted).toBeDefined();
      expect(encrypted.args_encrypted).toBeUndefined();
      expect(encrypted.env_encrypted).toBeUndefined();
      expect(encrypted.url_encrypted).toBeUndefined();
      
      const decrypted = decryptServerData(encrypted);
      expect(decrypted.command).toBe('/bin/bash');
    });

    it('should handle null values', () => {
      const serverWithNulls = {
        command: null,
        args: null,
        env: null,
        url: null
      };
      
      const encrypted = encryptServerData(serverWithNulls);
      expect(encrypted.command_encrypted).toBeUndefined();
      expect(encrypted.args_encrypted).toBeUndefined();
      expect(encrypted.env_encrypted).toBeUndefined();
      expect(encrypted.url_encrypted).toBeUndefined();
    });

    it('should handle decryption errors gracefully', () => {
      const serverWithBadData = {
        command_encrypted: 'invalid-encrypted-data'
      };
      
      const decrypted = decryptServerData(serverWithBadData);
      // Should set to null on error, not throw
      expect(decrypted.command).toBeNull();
    });
  });
});