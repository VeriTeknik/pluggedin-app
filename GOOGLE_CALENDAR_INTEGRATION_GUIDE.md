# Google Calendar Integration Guide

This guide explains how to set up and use Google Calendar integration for meeting scheduling via embedded chat.

## Overview

The Google Calendar integration uses a **dedicated calendar approach** with **least-privilege OAuth scopes** for enhanced security and privacy. The system:

- Creates a dedicated "Plugged.in" calendar for each user
- Uses minimal OAuth scopes required for functionality
- Checks availability across all user calendars using FreeBusy API
- Schedules meetings only in the dedicated Plugged.in calendar
- Supports Google Meet integration
- Maintains complete user privacy by not reading event details from other calendars

## Key Features

### 🔒 Enhanced Security
- **Least-Privilege Scopes**: Only requests necessary permissions
- **Dedicated Calendar**: Isolates Plugged.in meetings from personal calendar
- **Privacy Protection**: Never reads event details from user's primary calendars

### 📅 Smart Availability
- **Multi-Calendar Support**: Checks availability across all user calendars
- **FreeBusy API**: Efficiently checks busy times without reading event content
- **Intelligent Scheduling**: Finds optimal time slots across all calendars

### 🎯 Enhanced Functionality
- **Google Meet Integration**: Automatically creates meeting links
- **Seamless Management**: Full CRUD operations for meetings
- **Idempotent Operations**: Safe retry and error handling

## Prerequisites

### 1. OAuth Setup

Your Google OAuth application must include the following **least-privilege scopes**:

```
https://www.googleapis.com/auth/calendar.app.created
https://www.googleapis.com/auth/calendarlist.readonly
https://www.googleapis.com/auth/calendar.freebusy
```

**Why these scopes?**
- `calendar.app.created`: Create and manage only the calendars created by this app
- `calendarlist.readonly`: Read the list of user's calendars (no event access)
- `calendar.freebusy`: Check busy/free status across calendars (no event details)

### 2. User Authentication

Users must authenticate with Google OAuth and grant the specific scopes listed above.

## Configuration

### Persona Setup

Each persona must have calendar integration enabled:

```json
{
  "integrations": {
    "calendar": {
      "enabled": true,
      "provider": "google_calendar",
      "config": {
        // calendarId is no longer needed - system uses dedicated calendar
      }
    }
  },
  "capabilities": [
    {
      "id": "schedule_meeting",
      "enabled": true,
      "category": "calendar"
    },
    {
      "id": "check_availability",
      "enabled": true,
      "category": "calendar"
    },
    {
      "id": "cancel_meeting",
      "enabled": true,
      "category": "calendar"
    },
    {
      "id": "update_meeting",
      "enabled": true,
      "category": "calendar"
    }
  ]
}
```

## API Endpoints

### Test Connection

```http
POST /api/embedded-chat/[uuid]/persona/[personaId]/integration
Content-Type: application/json

{
  "type": "test",
  "integration": "calendar"
}
```

### Check Availability

```http
POST /api/embedded-chat/[uuid]/persona/[personaId]/integration
Content-Type: application/json

{
  "type": "calendar",
  "action": {
    "type": "check_availability",
    "payload": {
      "startTime": "2024-01-15T09:00:00Z",
      "endTime": "2024-01-15T17:00:00Z",
      "duration": 30
    }
  }
}
```

### Schedule Meeting

```http
POST /api/embedded-chat/[uuid]/persona/[personaId]/integration
Content-Type: application/json

{
  "type": "calendar",
  "action": {
    "type": "schedule_meeting",
    "payload": {
      "title": "Team Meeting",
      "description": "Weekly team sync",
      "startTime": "2024-01-15T10:00:00Z",
      "endTime": "2024-01-15T11:00:00Z",
      "attendees": ["person@example.com"],
      "location": "Conference Room A",
      "timeZone": "America/New_York",
      "includeGoogleMeet": true
    }
  }
}
```

**New Features:**
- `includeGoogleMeet`: Optional parameter to automatically create Google Meet conference
- Meetings are automatically created in the dedicated "Plugged.in" calendar
- System handles calendar creation automatically if it doesn't exist

### Cancel Meeting

```http
POST /api/embedded-chat/[uuid]/persona/[personaId]/integration
Content-Type: application/json

{
  "type": "calendar",
  "action": {
    "type": "cancel_meeting",
    "payload": {
      "eventId": "event_id_here",
      "sendNotifications": true
    }
  }
}
```

### Update Meeting

```http
POST /api/embedded-chat/[uuid]/persona/[personaId]/integration
Content-Type: application/json

{
  "type": "calendar",
  "action": {
    "type": "update_meeting",
    "payload": {
      "eventId": "event_id_here",
      "updates": {
        "title": "Updated Meeting Title",
        "description": "Updated description",
        "startTime": "2024-01-15T11:00:00Z",
        "endTime": "2024-01-15T12:00:00Z"
      }
    }
  }
}
```

## Response Formats

### Success Response

```json
{
  "success": true,
  "data": {
    "eventId": "event_id_here",
    "htmlLink": "https://calendar.google.com/calendar/event?eid=event_id_here",
    "meetLink": "https://meet.google.com/abc-defg-hij",
    "message": "Meeting scheduled successfully in Plugged.in calendar with Google Meet"
  }
}
```

**New Response Fields:**
- `meetLink`: Google Meet conference URL (if `includeGoogleMeet` was true)
- Enhanced message indicating dedicated calendar usage

### Check Availability Response

```json
{
  "success": true,
  "data": {
    "availableSlots": [
      {
        "start": "2024-01-15T09:00:00Z",
        "end": "2024-01-15T09:30:00Z"
      },
      {
        "start": "2024-01-15T11:00:00Z",
        "end": "2024-01-15T11:30:00Z"
      }
    ],
    "busyTimes": [
      {
        "start": "2024-01-15T10:00:00Z",
        "end": "2024-01-15T11:00:00Z"
      }
    ],
    "calendarCount": 3
  }
}
```

**Enhanced Features:**
- `calendarCount`: Number of calendars checked for availability
- Availability now considers ALL user calendars, not just primary

### Error Response

```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "details": {
    "missingScopes": ["calendar.app.created"],
    "requiredScopes": ["calendar.app.created", "calendarlist.readonly", "calendar.freebusy"],
    "message": "The dedicated calendar approach requires these specific scopes for security and privacy."
  }
}
```

**Enhanced Error Details:**
- Detailed scope validation errors
- Clear guidance on required permissions

## Common Errors and Solutions

### 400 Bad Request

**Cause**: Missing or invalid payload
**Solution**: Ensure all required fields are present and correctly formatted

### 401 Unauthorized

**Cause**: Authentication failed
**Solution**: Check user session and OAuth tokens

### 404 Not Found

**Cause**: Chat or persona not found
**Solution**: Verify UUID and persona ID are correct

### Google Calendar Not Connected

**Cause**: User hasn't connected Google account or lacks calendar scopes
**Solution**: 
1. Re-authenticate with Google OAuth
2. Ensure calendar scopes are granted
3. Check access token validity

### Calendar Integration Not Enabled

**Cause**: Persona doesn't have calendar integration enabled
**Solution**: Enable calendar integration in persona settings

## Testing

Use the provided test script to validate your integration:

```bash
node test-calendar-integration.js
```

## Chat Interface Integration

The calendar integration works seamlessly with the embedded chat interface. Users can:

1. **Natural Language Commands**: Users can type requests like:
   - "Schedule a meeting tomorrow at 2pm"
   - "Check my availability next week"
   - "Book a team meeting for Friday"

2. **Tool Execution**: The system will automatically use the calendar tools when:
   - Calendar capabilities are enabled
   - User requests meeting-related actions
   - Proper integration is configured

## Troubleshooting

### Check Logs

Enable debug logging to see detailed information:
- Server logs will show `[INTEGRATION]` prefixed messages
- Check browser console for client-side errors
- Monitor network requests in browser dev tools

### Common Issues

1. **Missing Least-Privilege OAuth Scopes**
   - Error: "Insufficient Google Calendar permissions. Please reconnect with the required scopes."
   - Fix: Re-authenticate with these specific scopes:
     - `calendar.app.created`
     - `calendarlist.readonly`
     - `calendar.freebusy`
   - Note: The old broad `calendar` and `calendar.events` scopes are no longer supported

2. **Dedicated Calendar Creation Failed**
   - Error: "Failed to ensure Plugged.in calendar exists"
   - Fix: Check OAuth permissions and retry. The system will automatically create the dedicated calendar on first use.

3. **Invalid Time Format**
   - Error: "Failed to schedule meeting"
   - Fix: Use ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)

4. **Google Meet Integration Issues**
   - Error: "Meeting scheduled but Google Meet link not created"
   - Fix: Ensure `includeGoogleMeet: true` is in the payload and check Google Meet permissions

5. **Multi-Calendar Availability Issues**
   - Error: "Failed to check availability across multiple calendars"
   - Fix: Verify that `calendarlist.readonly` and `calendar.freebusy` scopes are granted

6. **Rate Limiting**
   - Error: "Rate limit exceeded"
   - Fix: Wait and retry, or check Google API quotas

## Security Considerations

### 🔒 Enhanced Security Model

1. **Least-Privilege OAuth Scopes**
   - Only requests minimal necessary permissions
   - `calendar.app.created`: Can only manage calendars created by this app
   - `calendarlist.readonly`: Can only read calendar list, not event details
   - `calendar.freebusy`: Can only check busy/free status, not event content

2. **Dedicated Calendar Isolation**
   - All Plugged.in meetings are created in a separate calendar
   - No access to user's personal calendar events
   - Complete privacy protection for sensitive calendar data

3. **Token Storage**: Access tokens are stored securely in the database
4. **Scope Validation**: Only requested scopes are used
5. **User Authorization**: Each user can only access their own calendars
6. **Rate Limiting**: Built-in rate limiting prevents abuse

### 🛡️ Privacy Protection

- **No Event Detail Access**: The system never reads the content of events from user's primary calendars
- **FreeBusy API Only**: Availability checks use time-slot data only, no meeting details
- **Data Minimization**: Only collects and processes the minimum data required
- **User Control**: Users can revoke access at any time through Google Account settings

### 📋 Compliance Benefits

- **GDPR Compliant**: Minimal data collection and processing
- **Enterprise Ready**: Security model suitable for corporate environments
- **Audit Trail**: All calendar operations are logged for transparency

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review server logs
3. Test with the provided test script
4. Verify OAuth configuration in Google Cloud Console