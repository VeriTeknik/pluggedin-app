import { BaseIntegrationService } from '../base-service';
import { CalendarIntegration, IntegrationAction, IntegrationResult } from '../types';

interface GoogleCalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  conferenceData?: {
    createRequest?: {
      requestId: string;
      conferenceSolutionKey?: {
        type: string;
      };
    };
  };
}

interface CalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
}

export class GoogleCalendarService extends BaseIntegrationService {
  private calendarIntegration: CalendarIntegration;
  private pluggedInCalendarId: string = '';

  constructor(integration: CalendarIntegration) {
    super(integration);
    console.log('[GoogleCalendarService] Received integration:', JSON.stringify(integration, null, 2));
    this.calendarIntegration = integration;
    console.log('[GoogleCalendarService] Config available:', !!integration?.config);
    console.log('[GoogleCalendarService] Access token available:', !!integration?.config?.accessToken);
  }

  async execute(action: IntegrationAction): Promise<IntegrationResult> {
    try {
      if (!await this.checkRateLimit()) {
        return {
          success: false,
          error: 'Rate limit exceeded',
        };
      }

      // Ensure we have a Plugged.in calendar
      if (action.type !== 'check_availability') {
        await this.ensurePluggedInCalendar();
      }

      let result: IntegrationResult;

      switch (action.type) {
        case 'schedule_meeting':
          result = await this.scheduleMeeting(action.payload);
          break;
        case 'check_availability':
          result = await this.checkAvailability(action.payload);
          break;
        case 'cancel_meeting':
          result = await this.cancelMeeting(action.payload);
          break;
        case 'update_meeting':
          result = await this.updateMeeting(action.payload);
          break;
        default:
          result = {
            success: false,
            error: `Unsupported action type: ${action.type}`,
          };
      }

      await this.logAction(action, result);
      return result;
    } catch (error) {
      return await this.handleError(error);
    }
  }

  async validate(): Promise<boolean> {
    try {
      // Check if we have necessary credentials
      const config = this.calendarIntegration.config;
      if (!config || (!config.accessToken && !config.apiKey)) {
        return false;
      }

      // Test API connection
      const testResult = await this.test();
      return testResult.success;
    } catch (error) {
      console.error('Google Calendar validation error:', error);
      return false;
    }
  }

  async test(): Promise<IntegrationResult> {
    try {
      // Test by fetching calendar list and ensuring Plugged.in calendar exists
      const calendarList = await this.getCalendarList();
      const pluggedInCalendar = calendarList.find(cal => cal.summary === 'Plugged.in');
      
      if (pluggedInCalendar) {
        this.pluggedInCalendarId = pluggedInCalendar.id;
        return {
          success: true,
          data: {
            message: 'Google Calendar connection successful',
            calendarId: pluggedInCalendar.id
          },
        };
      } else {
        return {
          success: true,
          data: {
            message: 'Google Calendar connection successful, Plugged.in calendar will be created on first use'
          },
        };
      }
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async ensurePluggedInCalendar(): Promise<string> {
    if (this.pluggedInCalendarId) {
      return this.pluggedInCalendarId;
    }

    try {
      const calendarList = await this.getCalendarList();
      const pluggedInCalendar = calendarList.find(cal => cal.summary === 'Plugged.in');

      if (pluggedInCalendar) {
        this.pluggedInCalendarId = pluggedInCalendar.id;
        return this.pluggedInCalendarId;
      }

      // Create Plugged.in calendar
      const response = await this.makeApiCall('/calendars', 'POST', {
        summary: 'Plugged.in',
        description: 'Dedicated calendar for Plugged.in meetings',
        timeZone: 'UTC'
      });

      if (response.ok) {
        const calendar = await response.json();
        this.pluggedInCalendarId = calendar.id;
        return this.pluggedInCalendarId;
      } else {
        throw new Error('Failed to create Plugged.in calendar');
      }
    } catch (error) {
      console.error('Error ensuring Plugged.in calendar:', error);
      throw new Error(`Failed to ensure Plugged.in calendar exists: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getCalendarList(): Promise<CalendarListEntry[]> {
    const response = await this.makeApiCall('/users/me/calendarList');
    
    if (response.ok) {
      const data = await response.json();
      return data.items || [];
    } else {
      const errorText = await response.text();
      console.error('[GoogleCalendarService] Calendar list API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      // Check for common errors
      if (response.status === 401) {
        throw new Error('Google Calendar authentication failed. Please reconnect your calendar.');
      } else if (response.status === 403) {
        throw new Error('Missing calendar permissions. Please reconnect with proper scopes.');
      } else {
        throw new Error(`Failed to fetch calendar list: ${response.status} ${errorText}`);
      }
    }
  }

  private async scheduleMeeting(payload: any): Promise<IntegrationResult> {
    try {
      const { title, description, startTime, endTime, attendees, location, includeGoogleMeet = false, organizerInfo } = payload;

      console.log('[GoogleCalendarService] scheduleMeeting payload:', JSON.stringify(payload, null, 2));
      console.log('[GoogleCalendarService] Attendees received:', attendees);
      console.log('[GoogleCalendarService] Organizer info:', organizerInfo);

      // Ensure we have a Plugged.in calendar
      const calendarId = await this.ensurePluggedInCalendar();

      // Filter and validate email addresses
      const validAttendees = attendees?.filter((email: string) => {
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValid = emailRegex.test(email);
        if (!isValid) {
          console.log(`[GoogleCalendarService] Invalid email filtered out: ${email}`);
        }
        return isValid;
      }) || [];

      const event: GoogleCalendarEvent = {
        summary: title,
        description: description,
        location: location,
        start: {
          dateTime: new Date(startTime).toISOString(),
          timeZone: payload.timeZone || 'UTC',
        },
        end: {
          dateTime: new Date(endTime).toISOString(),
          timeZone: payload.timeZone || 'UTC',
        },
        attendees: validAttendees.map((email: string) => ({ email })),
      };

      // Add Google Meet integration if requested
      if (includeGoogleMeet) {
        event.conferenceData = {
          createRequest: {
            requestId: `pluggedin-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        };
      }

      const response = await this.makeApiCall(
        `/calendars/${calendarId}/events?conferenceDataVersion=1`,
        'POST',
        event
      );

      if (response.ok) {
        const data = await response.json();
        console.log('[GoogleCalendarService] Event created successfully:', {
          eventId: data.id,
          htmlLink: data.htmlLink,
          calendarId: calendarId,
          attendees: data.attendees
        });
        
        return {
          success: true,
          data: {
            eventId: data.id,
            htmlLink: data.htmlLink,
            meetLink: data.conferenceData?.entryPoints?.[0]?.uri,
            calendarId: calendarId,
            message: `Meeting scheduled successfully in Plugged.in calendar${includeGoogleMeet ? ' with Google Meet' : ''}. View in Google Calendar: ${data.htmlLink}`,
          },
        };
      } else {
        const error = await response.text();
        return {
          success: false,
          error: `Failed to schedule meeting: ${error}`,
        };
      }
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async checkAvailability(payload: any): Promise<IntegrationResult> {
    try {
      const { startTime, endTime, duration = 30 } = payload;
      
      const timeMin = new Date(startTime).toISOString();
      const timeMax = new Date(endTime).toISOString();

      // Get all user calendars for availability check
      const calendarList = await this.getCalendarList();
      const calendarItems = calendarList.map(cal => ({ id: cal.id }));

      // Get busy times across all calendars using FreeBusy API
      const response = await this.makeApiCall(
        `/freeBusy`,
        'POST',
        {
          timeMin,
          timeMax,
          items: calendarItems,
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Aggregate busy times from all calendars
        const allBusyTimes: Array<{ start: string; end: string }> = [];
        
        for (const calendarId in data.calendars) {
          const calendarBusy = data.calendars[calendarId]?.busy || [];
          allBusyTimes.push(...calendarBusy);
        }
        
        // Calculate available slots
        const availableSlots = this.calculateAvailableSlots(
          new Date(startTime),
          new Date(endTime),
          allBusyTimes,
          duration
        );

        // Check if the requested time slot has conflicts
        const requestedStart = new Date(startTime);
        const requestedEnd = new Date(endTime || new Date(requestedStart.getTime() + duration * 60000));
        
        const conflicts = allBusyTimes.filter(busy => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          
          // Check for overlap
          return (requestedStart < busyEnd && requestedEnd > busyStart);
        });

        // Get event details for conflicts if possible
        const conflictDetails = [];
        if (conflicts.length > 0) {
          // Try to get event summaries for the conflicts
          for (const calendarId of calendarItems.map(c => c.id)) {
            try {
              const eventsResponse = await this.makeApiCall(
                `/calendars/${calendarId}/events?` +
                `timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`,
                'GET'
              );
              
              if (eventsResponse.ok) {
                const eventsData = await eventsResponse.json();
                const events = eventsData.items || [];
                
                for (const event of events) {
                  if (event.start && event.end) {
                    const eventStart = new Date(event.start.dateTime || event.start.date);
                    const eventEnd = new Date(event.end.dateTime || event.end.date);
                    
                    if (requestedStart < eventEnd && requestedEnd > eventStart) {
                      conflictDetails.push({
                        summary: event.summary || 'Busy',
                        start: event.start.dateTime || event.start.date,
                        end: event.end.dateTime || event.end.date,
                        calendarId
                      });
                    }
                  }
                }
              }
            } catch (error) {
              console.log('[GoogleCalendarService] Could not fetch event details for conflicts');
            }
          }
        }

        return {
          success: true,
          data: {
            availableSlots,
            busyTimes: allBusyTimes,
            calendarCount: calendarItems.length,
            hasConflicts: conflicts.length > 0,
            conflicts: conflictDetails.length > 0 ? conflictDetails : conflicts.map(c => ({ 
              summary: 'Busy', 
              start: c.start, 
              end: c.end 
            }))
          },
        };
      } else {
        return {
          success: false,
          error: 'Failed to check availability',
        };
      }
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async cancelMeeting(payload: any): Promise<IntegrationResult> {
    try {
      const { eventId, sendNotifications = true } = payload;
      
      // Ensure we have a Plugged.in calendar
      const calendarId = await this.ensurePluggedInCalendar();
      
      const response = await this.makeApiCall(
        `/calendars/${calendarId}/events/${eventId}?sendNotifications=${sendNotifications}`,
        'DELETE'
      );

      if (response.ok || response.status === 204) {
        return {
          success: true,
          data: { message: 'Meeting cancelled successfully from Plugged.in calendar' },
        };
      } else {
        return {
          success: false,
          error: 'Failed to cancel meeting',
        };
      }
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async updateMeeting(payload: any): Promise<IntegrationResult> {
    try {
      const { eventId, updates } = payload;
      
      // Ensure we have a Plugged.in calendar
      const calendarId = await this.ensurePluggedInCalendar();
      
      // First get the existing event
      const getResponse = await this.makeApiCall(
        `/calendars/${calendarId}/events/${eventId}`,
        'GET'
      );

      if (!getResponse.ok) {
        return {
          success: false,
          error: 'Failed to fetch existing event',
        };
      }

      const existingEvent = await getResponse.json();
      
      // Merge updates
      const updatedEvent = { ...existingEvent, ...updates };
      
      const response = await this.makeApiCall(
        `/calendars/${calendarId}/events/${eventId}`,
        'PUT',
        updatedEvent
      );

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          data: {
            eventId: data.id,
            htmlLink: data.htmlLink,
            meetLink: data.conferenceData?.entryPoints?.[0]?.uri,
            message: 'Meeting updated successfully in Plugged.in calendar',
          },
        };
      } else {
        return {
          success: false,
          error: 'Failed to update meeting',
        };
      }
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async makeApiCall(
    endpoint: string, 
    method: string = 'GET', 
    body?: any
  ): Promise<Response> {
    const baseUrl = 'https://www.googleapis.com/calendar/v3';
    const config = this.calendarIntegration.config;
    
    console.log('[GoogleCalendarService] makeApiCall:', {
      endpoint,
      method,
      hasConfig: !!config,
      hasAccessToken: !!config?.accessToken,
      hasApiKey: !!config?.apiKey
    });
    
    // Check if config exists
    if (!config) {
      throw new Error('Calendar integration is not configured. Please connect your Google Calendar account first.');
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Use access token if available, otherwise use API key
    if (config.accessToken) {
      headers['Authorization'] = `Bearer ${config.accessToken}`;
      console.log('[GoogleCalendarService] Using access token for authentication');
    }

    const url = new URL(`${baseUrl}${endpoint}`);
    if (config.apiKey && !config.accessToken) {
      url.searchParams.set('key', config.apiKey);
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    return fetch(url.toString(), options);
  }

  private calculateAvailableSlots(
    startTime: Date,
    endTime: Date,
    busyTimes: Array<{ start: string; end: string }>,
    duration: number
  ): Array<{ start: Date; end: Date }> {
    const slots: Array<{ start: Date; end: Date }> = [];
    const durationMs = duration * 60 * 1000;
    
    // Sort busy times
    const sortedBusy = busyTimes
      .map(b => ({
        start: new Date(b.start),
        end: new Date(b.end),
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    let currentTime = startTime;

    for (const busy of sortedBusy) {
      // Check if there's a gap before this busy time
      if (busy.start.getTime() - currentTime.getTime() >= durationMs) {
        let slotStart = currentTime;
        while (slotStart.getTime() + durationMs <= busy.start.getTime()) {
          slots.push({
            start: new Date(slotStart),
            end: new Date(slotStart.getTime() + durationMs),
          });
          slotStart = new Date(slotStart.getTime() + durationMs);
        }
      }
      currentTime = busy.end;
    }

    // Check remaining time after last busy period
    if (endTime.getTime() - currentTime.getTime() >= durationMs) {
      let slotStart = currentTime;
      while (slotStart.getTime() + durationMs <= endTime.getTime()) {
        slots.push({
          start: new Date(slotStart),
          end: new Date(slotStart.getTime() + durationMs),
        });
        slotStart = new Date(slotStart.getTime() + durationMs);
      }
    }

    return slots;
  }
}