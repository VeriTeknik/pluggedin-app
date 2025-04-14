import crypto from 'crypto';

// Generate a secure 32-byte (256-bit) random key
const key = crypto.randomBytes(32);

// Convert to base64 for storage
const base64Key = key.toString('base64');

console.log('Generated Server Actions Encryption Key:');
console.log(base64Key);
console.log('\nAdd this to your environment variables as NEXT_SERVER_ACTIONS_ENCRYPTION_KEY'); 