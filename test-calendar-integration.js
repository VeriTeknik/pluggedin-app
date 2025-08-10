/**
 * Test script for Google Calendar integration
 * This script helps test the calendar integration endpoint with different payload formats
 */

const EMBEDDED_CHAT_UUID = '3d549801-ad1c-4fb8-9d28-6beade138355'; // Replace with your actual UUID
const PERSONA_ID = 1; // Replace with your actual persona ID
const BASE_URL = 'http://localhost:3000';

// Test payloads for different scenarios - Updated for dedicated calendar approach
const testCases = [
  {
    name: 'Test Calendar Connection',
    payload: {
      type: 'test',
      integration: 'calendar'
    }
  },
  {
    name: 'Check Availability (Multi-Calendar)',
    payload: {
      type: 'calendar',
      action: {
        type: 'check_availability',
        payload: {
          startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          endTime: new Date(Date.now() + 86400000 + 28800000).toISOString(), // Tomorrow + 8 hours
          duration: 30
        }
      }
    }
  },
  {
    name: 'Schedule Meeting with Google Meet',
    payload: {
      type: 'calendar',
      action: {
        type: 'schedule_meeting',
        payload: {
          title: 'Test Meeting with Google Meet',
          description: 'This is a test meeting created via API with Google Meet integration',
          startTime: new Date(Date.now() + 2 * 86400000).toISOString(), // Day after tomorrow
          endTime: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(), // + 1 hour
          attendees: ['test@example.com'],
          location: 'Virtual Meeting',
          timeZone: 'UTC',
          includeGoogleMeet: true
        }
      }
    }
  },
  {
    name: 'Schedule Meeting without Google Meet',
    payload: {
      type: 'calendar',
      action: {
        type: 'schedule_meeting',
        payload: {
          title: 'Test Meeting without Google Meet',
          description: 'This is a test meeting created via API without Google Meet',
          startTime: new Date(Date.now() + 3 * 86400000).toISOString(), // 3 days from now
          endTime: new Date(Date.now() + 3 * 86400000 + 1800000).toISOString(), // + 30 minutes
          attendees: ['test@example.com'],
          location: 'Conference Room A',
          timeZone: 'UTC',
          includeGoogleMeet: false
        }
      }
    }
  },
  {
    name: 'Cancel Meeting',
    payload: {
      type: 'calendar',
      action: {
        type: 'cancel_meeting',
        payload: {
          eventId: 'placeholder_event_id', // This should be replaced with an actual event ID from a successful meeting creation
          sendNotifications: true
        }
      }
    }
  },
  {
    name: 'Update Meeting',
    payload: {
      type: 'calendar',
      action: {
        type: 'update_meeting',
        payload: {
          eventId: 'placeholder_event_id', // This should be replaced with an actual event ID
          updates: {
            title: 'Updated Test Meeting',
            description: 'This meeting has been updated via API',
            startTime: new Date(Date.now() + 4 * 86400000).toISOString(), // 4 days from now
            endTime: new Date(Date.now() + 4 * 86400000 + 3600000).toISOString() // + 1 hour
          }
        }
      }
    }
  },
  {
    name: 'Invalid Payload - Missing Action',
    payload: {
      type: 'calendar'
    }
  },
  {
    name: 'Invalid Payload - Missing Type',
    payload: {
      action: {
        type: 'schedule_meeting',
        payload: {}
      }
    }
  }
];

async function testCalendarIntegration() {
  console.log('🧪 Testing Google Calendar Integration\n');
  
  for (const testCase of testCases) {
    console.log(`📋 Test Case: ${testCase.name}`);
    console.log('📤 Payload:', JSON.stringify(testCase.payload, null, 2));
    
    try {
      const response = await fetch(
        `${BASE_URL}/api/embedded-chat/${EMBEDDED_CHAT_UUID}/persona/${PERSONA_ID}/integration`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Add authentication headers if needed
            // 'Authorization': 'Bearer YOUR_TOKEN_HERE',
            // 'Cookie': 'YOUR_SESSION_COOKIE_HERE',
          },
          body: JSON.stringify(testCase.payload)
        }
      );
      
      const result = await response.json();
      
      console.log('📥 Response Status:', response.status);
      console.log('📥 Response Body:', JSON.stringify(result, null, 2));
      
      if (response.ok) {
        console.log('✅ Test passed\n');
      } else {
        console.log('❌ Test failed\n');
      }
    } catch (error) {
      console.log('💥 Test error:', error.message, '\n');
    }
    
    console.log('─'.repeat(50));
  }
}

// OAuth Scope Check - Updated for least-privilege scopes
async function checkOAuthScopes() {
  console.log('🔍 Checking OAuth Scopes Requirements\n');
  
  console.log('📋 Required Google Calendar OAuth Scopes (Least-Privilege):');
  console.log('• https://www.googleapis.com/auth/calendar.app.created');
  console.log('• https://www.googleapis.com/auth/calendarlist.readonly');
  console.log('• https://www.googleapis.com/auth/calendar.freebusy');
  
  console.log('\n🔒 Why these scopes?');
  console.log('• calendar.app.created: Can only manage calendars created by this app');
  console.log('• calendarlist.readonly: Can read calendar list, not event details');
  console.log('• calendar.freebusy: Can check busy/free status, not event content');
  
  console.log('\n❌ Deprecated scopes (no longer supported):');
  console.log('• https://www.googleapis.com/auth/calendar');
  console.log('• https://www.googleapis.com/auth/calendar.events');
  
  console.log('\n🔧 To check your current OAuth scopes:');
  console.log('1. Go to Google Cloud Console');
  console.log('2. Navigate to your project');
  console.log('3. Check OAuth consent screen configuration');
  console.log('4. Verify the new scopes are included');
  
  console.log('\n🔄 To reconnect with proper scopes:');
  console.log('1. Revoke existing access if needed');
  console.log('2. Re-authenticate with the new least-privilege scopes');
  console.log('3. Ensure the access token includes the new permissions');
}

// Persona Configuration Check - Updated for dedicated calendar approach
async function checkPersonaConfiguration() {
  console.log('⚙️  Persona Configuration Check\n');
  
  console.log('📋 Required persona configuration:');
  console.log('1. Calendar integration must be enabled');
  console.log('2. Provider must be set to "google_calendar"');
  console.log('3. User must have Google OAuth with least-privilege scopes');
  console.log('4. Capabilities must be enabled:');
  console.log('   - schedule_meeting');
  console.log('   - check_availability');
  console.log('   - cancel_meeting');
  console.log('   - update_meeting');
  
  console.log('\n🔧 Note: calendarId is no longer needed - system uses dedicated calendar');
  
  console.log('\n📝 Example persona integration structure:');
  console.log(JSON.stringify({
    integrations: {
      calendar: {
        enabled: true,
        provider: 'google_calendar',
        config: {
          // calendarId is no longer needed - system uses dedicated calendar
        }
      }
    },
    capabilities: [
      {
        id: 'schedule_meeting',
        enabled: true,
        category: 'calendar'
      },
      {
        id: 'check_availability',
        enabled: true,
        category: 'calendar'
      },
      {
        id: 'cancel_meeting',
        enabled: true,
        category: 'calendar'
      },
      {
        id: 'update_meeting',
        enabled: true,
        category: 'calendar'
      }
    ]
  }, null, 2));
}

// Capability Validation Test
async function testCapabilityValidation() {
  console.log('🔐 Testing Capability Validation\n');
  
  const baseUrl = BASE_URL;
  const chatUuid = EMBEDDED_CHAT_UUID;
  const personaId = PERSONA_ID;
  
  console.log('📋 Testing with disabled schedule_meeting capability...');
  
  // Test with disabled capabilities
  const disabledResponse = await fetch(`${baseUrl}/api/embedded-chat/${chatUuid}/persona/${personaId}/integration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'calendar',
      action: {
        type: 'schedule_meeting',
        payload: {
          title: 'Test Meeting',
          startTime: '2024-12-20T10:00:00',
          endTime: '2024-12-20T11:00:00',
          attendees: ['test@example.com']
        }
      }
    })
  });
  
  const disabledResult = await disabledResponse.json();
  console.log('Disabled capability test:', {
    status: disabledResponse.status,
    success: disabledResult.success,
    error: disabledResult.error
  });
  
  if (disabledResponse.status === 400 &&
      disabledResult.error?.includes('not enabled for this persona')) {
    console.log('✅ Capability validation working correctly');
  } else {
    console.log('❌ Capability validation failed');
    console.log('Expected: 400 error with capability disabled message');
    console.log('Got:', disabledResult);
  }
  
  console.log('\n📋 Testing with missing required integrations...');
  
  // Test with missing calendar integration
  const missingIntegrationResponse = await fetch(`${baseUrl}/api/embedded-chat/${chatUuid}/persona/${personaId}/integration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'calendar',
      action: {
        type: 'schedule_meeting',
        payload: {
          title: 'Test Meeting',
          startTime: '2024-12-20T10:00:00',
          endTime: '2024-12-20T11:00:00',
          attendees: ['test@example.com']
        }
      }
    })
  });
  
  const missingIntegrationResult = await missingIntegrationResponse.json();
  console.log('Missing integration test:', {
    status: missingIntegrationResponse.status,
    success: missingIntegrationResult.success,
    error: missingIntegrationResult.error
  });
  
  if (missingIntegrationResponse.status === 400 &&
      missingIntegrationResult.error?.includes('Required integrations not available')) {
    console.log('✅ Integration requirement validation working correctly');
  } else {
    console.log('❌ Integration requirement validation failed');
    console.log('Expected: 400 error with missing integrations message');
    console.log('Got:', missingIntegrationResult);
  }
}

// Main execution
async function main() {
  console.log('🗓️  Google Calendar Integration Test Suite - Dedicated Calendar Edition\n');
  console.log('🔒 This test suite validates the new dedicated calendar approach with least-privilege scopes\n');
  console.log('Make sure your server is running and you have:');
  console.log('• Valid embedded chat UUID');
  console.log('• Configured persona with calendar integration');
  console.log('• Google OAuth with least-privilege scopes (calendar.app.created, calendarlist.readonly, calendar.freebusy)\n');
  
  console.log('🆕 New Features to Test:');
  console.log('• Dedicated "Plugged.in" calendar creation');
  console.log('• Multi-calendar availability checking using FreeBusy API');
  console.log('• Google Meet integration');
  console.log('• Enhanced security and privacy protection\n');
  
  await checkOAuthScopes();
  console.log('\n' + '═'.repeat(50) + '\n');
  
  await checkPersonaConfiguration();
  console.log('\n' + '═'.repeat(50) + '\n');
  
  await testCapabilityValidation();
  console.log('\n' + '═'.repeat(50) + '\n');
  
  await testCalendarIntegration();
}

// Run the tests
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testCalendarIntegration,
  checkOAuthScopes,
  checkPersonaConfiguration,
  testCapabilityValidation
};