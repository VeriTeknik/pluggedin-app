#!/usr/bin/env ts-node

/**
 * Test script for GitHub App integration
 */

import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import jwt from 'jsonwebtoken';

// Load environment variables
dotenv.config();

async function testGitHubApp() {
  console.log('Testing GitHub App Configuration...\n');

  // Check environment variables
  const appId = process.env.GITHUB_APP_ID;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const privateKeyBase64 = process.env.GITHUB_APP_PRIVATE_KEY;

  console.log('Environment Variables:');
  console.log(`- GITHUB_APP_ID: ${appId ? '✓ Set' : '✗ Missing'}`);
  console.log(`- GITHUB_CLIENT_ID: ${clientId ? '✓ Set' : '✗ Missing'}`);
  console.log(`- GITHUB_CLIENT_SECRET: ${clientSecret ? '✓ Set' : '✗ Missing'}`);
  console.log(`- GITHUB_APP_PRIVATE_KEY: ${privateKeyBase64 ? '✓ Set' : '✗ Missing'}`);

  if (!appId || !privateKeyBase64) {
    console.error('\nError: Required environment variables are missing');
    process.exit(1);
  }

  // Decode private key
  let privateKey: string;
  try {
    privateKey = Buffer.from(privateKeyBase64, 'base64').toString();
    console.log('\n✓ Successfully decoded private key');
  } catch (error) {
    console.error('\n✗ Failed to decode private key:', error);
    process.exit(1);
  }

  // Generate JWT
  try {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now,
      exp: now + 600, // 10 minutes
      iss: appId,
    };

    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    console.log('✓ Successfully generated JWT token');

    // Test GitHub API with app authentication
    const octokit = new Octokit({
      auth: token,
    });

    // Get app info
    const { data: app } = await octokit.request('GET /app');
    console.log('\n✓ Successfully authenticated as GitHub App:');
    console.log(`  - Name: ${app.name}`);
    console.log(`  - ID: ${app.id}`);
    console.log(`  - Owner: ${app.owner.login}`);
    console.log(`  - Installations: ${app.installations_count}`);

    // Get installations
    const { data: installations } = await octokit.request('GET /app/installations');
    console.log(`\n✓ Found ${installations.length} installations`);
    
    if (installations.length > 0) {
      console.log('\nInstallations:');
      installations.forEach((installation: any) => {
        console.log(`  - ${installation.account.login} (ID: ${installation.id})`);
      });
    }

  } catch (error: any) {
    console.error('\n✗ GitHub API Error:', error.message);
    if (error.status === 401) {
      console.error('  Authentication failed - check your private key and app ID');
    }
    process.exit(1);
  }

  console.log('\n✅ GitHub App configuration is working correctly!');
}

// Run the test
testGitHubApp().catch(console.error);