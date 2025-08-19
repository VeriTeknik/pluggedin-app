#!/usr/bin/env npx tsx

// Simple test to verify Slack webhook is working
// Run with: npx tsx test-slack-webhook.ts

async function testSlackWebhook() {
  // You'll need to get the webhook URL from your persona configuration
  // Check in the database or through the UI
  const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
  
  if (!WEBHOOK_URL) {
    console.error('Please set SLACK_WEBHOOK_URL environment variable');
    console.log('You can find this in your persona Slack integration settings');
    process.exit(1);
  }

  console.log('Testing Slack webhook...');
  console.log('Webhook URL length:', WEBHOOK_URL.length);
  console.log('Webhook URL starts with:', WEBHOOK_URL.substring(0, 30) + '...');

  const testMessage = {
    text: `Test message from Plugged.in at ${new Date().toLocaleString()}`
  };

  try {
    console.log('\nSending test message:', JSON.stringify(testMessage, null, 2));
    
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMessage),
    });

    const responseText = await response.text();
    
    console.log('\nResponse status:', response.status);
    console.log('Response text:', responseText);
    
    if (response.ok && responseText.toLowerCase() === 'ok') {
      console.log('\n✅ Webhook responded with OK');
      console.log('Check your Slack channel for the message.');
      console.log('Note: The message will appear in the channel the webhook was configured for.');
    } else {
      console.log('\n❌ Webhook failed');
      console.log('Response:', responseText);
    }
  } catch (error) {
    console.error('\n❌ Error testing webhook:', error);
  }
}

// Also test with channel parameter (though webhooks ignore it)
async function testWithChannel() {
  const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
  
  if (!WEBHOOK_URL) return;

  console.log('\n--- Testing with channel parameter ---');
  
  const testMessage = {
    text: `Test with channel param at ${new Date().toLocaleString()}`,
    channel: '#plugged_in'
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMessage),
    });

    const responseText = await response.text();
    console.log('Response:', responseText);
    console.log('Note: Webhooks ignore the channel parameter and post to their configured channel');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run tests
testSlackWebhook().then(() => testWithChannel());