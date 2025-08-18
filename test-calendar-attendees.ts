#!/usr/bin/env npx tsx

import { db } from './db';
import { eq, and } from 'drizzle-orm';
import { accounts, users } from './db/schema';
import { GoogleCalendarService } from './lib/integrations/calendar/google-calendar';
import { CalendarIntegration } from './lib/integrations/types';
import { getValidGoogleAccessToken } from './lib/auth/google-token-refresh';

async function testCalendarWithAttendees() {
  console.log('=== Testing Google Calendar with Attendees ===\n');

  try {
    // Find a user with Google account
    const userWithGoogle = await db.query.users.findFirst({
      where: eq(users.email, 'cem.karaca@gmail.com')
    });

    if (!userWithGoogle) {
      console.error('User not found');
      return;
    }

    console.log('Found user:', userWithGoogle.email);

    // Get Google account
    const googleAccount = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.userId, userWithGoogle.id),
        eq(accounts.provider, 'google')
      )
    });

    if (!googleAccount) {
      console.error('No Google account found for user');
      return;
    }

    console.log('Found Google account with scopes:', googleAccount.scope);

    // Get valid access token
    const validAccessToken = await getValidGoogleAccessToken(userWithGoogle.id);
    
    if (!validAccessToken) {
      console.error('Failed to get valid access token');
      return;
    }

    console.log('Got valid access token');

    // Create calendar integration config
    const calendarIntegration: CalendarIntegration = {
      enabled: true,
      provider: 'google',
      config: {
        accessToken: validAccessToken,
        refreshToken: googleAccount.refresh_token,
        userEmail: userWithGoogle.email // Include user email for ACL
      },
      status: 'active'
    };

    console.log('Calendar config created with user email:', userWithGoogle.email);

    // Create calendar service
    const calendarService = new GoogleCalendarService(calendarIntegration);

    // Test creating an event with attendees
    const testEvent = {
      type: 'schedule_meeting',
      payload: {
        title: 'Test Meeting with Attendees',
        description: 'Testing if attendees are properly added to the calendar event',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(), // 1 hour later
        attendees: ['cem@ikikule.com', 'test@example.com'],
        location: 'Online',
        includeGoogleMeet: true,
        organizerInfo: {
          email: userWithGoogle.email
        }
      }
    };

    console.log('\nCreating test event with attendees:', testEvent.payload.attendees);
    
    const result = await calendarService.execute(testEvent);
    
    if (result.success) {
      console.log('\n✅ Event created successfully!');
      console.log('Event ID:', result.data?.eventId);
      console.log('Calendar Link:', result.data?.htmlLink);
      console.log('Were attendees included?:', result.data?.attendeesIncluded || false);
      console.log('\nPlease check your Google Calendar to verify attendees are listed');
    } else {
      console.error('\n❌ Failed to create event:', result.error);
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
}

// Run the test
testCalendarWithAttendees();