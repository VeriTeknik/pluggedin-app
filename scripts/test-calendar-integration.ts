#!/usr/bin/env tsx

import { GoogleCalendarService } from '../lib/integrations/calendar/google-calendar';
import { CalendarIntegration, IntegrationAction } from '../lib/integrations/types';

// Test configuration
const testIntegration: CalendarIntegration = {
  enabled: true,
  provider: 'google_calendar',
  config: {
    // You'll need to add a valid access token here for testing
    // Or use API key for read-only operations
    apiKey: process.env.GOOGLE_API_KEY,
    calendarId: 'primary',
  },
  status: 'active',
};

async function testGoogleCalendar() {
  console.log('🧪 Testing Google Calendar Integration...\n');
  
  const service = new GoogleCalendarService(testIntegration);
  
  // Test connection
  console.log('1. Testing connection...');
  const testResult = await service.test();
  console.log('   Result:', testResult.success ? '✅ Connected' : `❌ Failed: ${testResult.error}`);
  
  if (!testResult.success) {
    console.log('\n⚠️  To test with real Google Calendar:');
    console.log('   1. Get an API key from Google Cloud Console');
    console.log('   2. Enable Calendar API');
    console.log('   3. Set GOOGLE_API_KEY environment variable');
    console.log('   OR');
    console.log('   1. Use OAuth flow to get an access token');
    console.log('   2. Update the config.accessToken in this script');
    return;
  }
  
  // Test check availability
  console.log('\n2. Checking availability...');
  const availabilityAction: IntegrationAction = {
    type: 'check_availability',
    payload: {
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Next 7 days
      duration: 30, // 30 minute slots
    },
    personaId: 1,
  };
  
  const availabilityResult = await service.execute(availabilityAction);
  console.log('   Result:', availabilityResult.success ? '✅ Success' : `❌ Failed: ${availabilityResult.error}`);
  
  if (availabilityResult.success && availabilityResult.data?.availableSlots) {
    console.log(`   Found ${availabilityResult.data.availableSlots.length} available slots`);
    if (availabilityResult.data.availableSlots.length > 0) {
      console.log('   First 3 slots:');
      availabilityResult.data.availableSlots.slice(0, 3).forEach((slot: any) => {
        console.log(`     - ${new Date(slot.start).toLocaleString()} to ${new Date(slot.end).toLocaleString()}`);
      });
    }
  }
  
  console.log('\n✨ Integration test complete!');
}

// Run the test
testGoogleCalendar().catch(console.error);