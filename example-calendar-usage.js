/**
 * Example: Complete Calendar Integration Flow
 * This demonstrates how to use the calendar integration from start to finish
 */

const EMBEDDED_CHAT_UUID = '3d549801-ad1c-4fb8-9d28-6beade138355'; // Replace with your UUID
const PERSONA_ID = 1; // Replace with your persona ID
const BASE_URL = 'http://localhost:3000';

/**
 * Step 1: Test the connection
 */
async function testConnection() {
  console.log('🔌 Step 1: Testing Calendar Connection');
  
  try {
    const response = await fetch(
      `${BASE_URL}/api/embedded-chat/${EMBEDDED_CHAT_UUID}/persona/${PERSONA_ID}/integration`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'test',
          integration: 'calendar'
        })
      }
    );
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ Calendar connection successful');
      console.log('📊 Details:', result.data);
      return true;
    } else {
      console.log('❌ Calendar connection failed');
      console.log('📊 Error:', result.error);
      return false;
    }
  } catch (error) {
    console.log('💥 Connection test error:', error.message);
    return false;
  }
}

/**
 * Step 2: Check availability
 */
async function checkAvailability() {
  console.log('\n📅 Step 2: Checking Availability');
  
  // Get tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0); // Start at 9 AM
  
  const endOfDay = new Date(tomorrow);
  endOfDay.setHours(17, 0, 0, 0); // End at 5 PM
  
  try {
    const response = await fetch(
      `${BASE_URL}/api/embedded-chat/${EMBEDDED_CHAT_UUID}/persona/${PERSONA_ID}/integration`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'calendar',
          action: {
            type: 'check_availability',
            payload: {
              startTime: tomorrow.toISOString(),
              endTime: endOfDay.toISOString(),
              duration: 30 // 30-minute slots
            }
          }
        })
      }
    );
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ Availability check successful');
      console.log('📊 Available slots:', result.data.availableSlots?.length || 0);
      console.log('📊 Busy times:', result.data.busyTimes?.length || 0);
      
      if (result.data.availableSlots && result.data.availableSlots.length > 0) {
        console.log('📅 First available slot:', new Date(result.data.availableSlots[0].start).toLocaleString());
        return result.data.availableSlots[0];
      } else {
        console.log('❌ No available slots found');
        return null;
      }
    } else {
      console.log('❌ Availability check failed');
      console.log('📊 Error:', result.error);
      return null;
    }
  } catch (error) {
    console.log('💥 Availability check error:', error.message);
    return null;
  }
}

/**
 * Step 3: Schedule a meeting
 */
async function scheduleMeeting(timeSlot) {
  if (!timeSlot) {
    console.log('\n❌ Cannot schedule meeting - no time slot available');
    return false;
  }
  
  console.log('\n📝 Step 3: Scheduling Meeting');
  
  const meetingData = {
    title: 'Team Sync Meeting',
    description: 'Weekly team synchronization to discuss progress and blockers',
    startTime: timeSlot.start.toISOString(),
    endTime: new Date(timeSlot.start.getTime() + 30 * 60 * 1000).toISOString(), // 30 minutes
    attendees: ['team@example.com', 'manager@example.com'],
    location: 'Virtual Meeting Room',
    timeZone: 'UTC'
  };
  
  try {
    const response = await fetch(
      `${BASE_URL}/api/embedded-chat/${EMBEDDED_CHAT_UUID}/persona/${PERSONA_ID}/integration`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'calendar',
          action: {
            type: 'schedule_meeting',
            payload: meetingData
          }
        })
      }
    );
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ Meeting scheduled successfully');
      console.log('📅 Event ID:', result.data.eventId);
      console.log('🔗 Calendar Link:', result.data.htmlLink);
      console.log('📅 Meeting Time:', new Date(meetingData.startTime).toLocaleString());
      return result.data;
    } else {
      console.log('❌ Meeting scheduling failed');
      console.log('📊 Error:', result.error);
      return false;
    }
  } catch (error) {
    console.log('💥 Meeting scheduling error:', error.message);
    return false;
  }
}

/**
 * Step 4: Cancel the meeting (cleanup)
 */
async function cancelMeeting(eventId) {
  if (!eventId) {
    console.log('\n⏭️  Skipping meeting cancellation - no event ID');
    return;
  }
  
  console.log('\n🗑️  Step 4: Canceling Meeting (Cleanup)');
  
  try {
    const response = await fetch(
      `${BASE_URL}/api/embedded-chat/${EMBEDDED_CHAT_UUID}/persona/${PERSONA_ID}/integration`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'calendar',
          action: {
            type: 'cancel_meeting',
            payload: {
              eventId: eventId,
              sendNotifications: false // Don't send notifications for test
            }
          }
        })
      }
    );
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ Meeting canceled successfully');
    } else {
      console.log('❌ Meeting cancellation failed');
      console.log('📊 Error:', result.error);
    }
  } catch (error) {
    console.log('💥 Meeting cancellation error:', error.message);
  }
}

/**
 * Main function to run the complete flow
 */
async function runCompleteFlow() {
  console.log('🚀 Complete Google Calendar Integration Flow');
  console.log('═'.repeat(50));
  
  // Step 1: Test connection
  const connectionOk = await testConnection();
  if (!connectionOk) {
    console.log('\n❌ Flow stopped: Connection test failed');
    console.log('💡 Please check:');
    console.log('   - Google OAuth is configured');
    console.log('   - Calendar integration is enabled');
    console.log('   - User has calendar permissions');
    return;
  }
  
  // Step 2: Check availability
  const availableSlot = await checkAvailability();
  if (!availableSlot) {
    console.log('\n❌ Flow stopped: No available slots');
    return;
  }
  
  // Step 3: Schedule meeting
  const meetingResult = await scheduleMeeting(availableSlot);
  if (!meetingResult) {
    console.log('\n❌ Flow stopped: Meeting scheduling failed');
    return;
  }
  
  // Step 4: Cancel meeting (cleanup)
  await cancelMeeting(meetingResult.eventId);
  
  console.log('\n🎉 Complete flow finished successfully!');
  console.log('═'.repeat(50));
}

/**
 * Quick test for specific scenarios
 */
async function quickTest() {
  console.log('⚡ Quick Test: Schedule Meeting Directly');
  console.log('═'.repeat(50));
  
  // Schedule a meeting for tomorrow at 2 PM
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0); // 2 PM
  
  const meetingData = {
    title: 'Quick Test Meeting',
    description: 'This is a quick test meeting',
    startTime: tomorrow.toISOString(),
    endTime: new Date(tomorrow.getTime() + 30 * 60 * 1000).toISOString(),
    attendees: ['test@example.com'],
    location: 'Test Location',
    timeZone: 'UTC'
  };
  
  try {
    const response = await fetch(
      `${BASE_URL}/api/embedded-chat/${EMBEDDED_CHAT_UUID}/persona/${PERSONA_ID}/integration`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'calendar',
          action: {
            type: 'schedule_meeting',
            payload: meetingData
          }
        })
      }
    );
    
    const result = await response.json();
    
    console.log('📤 Request:', JSON.stringify(meetingData, null, 2));
    console.log('📥 Response:', JSON.stringify(result, null, 2));
    
    if (response.ok && result.success) {
      console.log('✅ Quick test successful');
      // Cancel the test meeting
      await cancelMeeting(result.data.eventId);
    } else {
      console.log('❌ Quick test failed');
    }
  } catch (error) {
    console.log('💥 Quick test error:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🗓️  Google Calendar Integration Examples');
  console.log('═'.repeat(50));
  
  if (process.argv.includes('--quick')) {
    await quickTest();
  } else {
    await runCompleteFlow();
  }
}

// Run the examples
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testConnection,
  checkAvailability,
  scheduleMeeting,
  cancelMeeting,
  runCompleteFlow,
  quickTest
};