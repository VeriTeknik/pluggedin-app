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
}

export class GoogleCalendarService extends BaseIntegrationService {
  private calendarIntegration: CalendarIntegration;

  constructor(integration: CalendarIntegration) {
    super(integration);
    this.calendarIntegration = integration;
  }

  async execute(action: IntegrationAction): Promise<IntegrationResult> {
    try {
      if (!await this.checkRateLimit()) {
        return {
          success: false,
          error: 'Rate limit exceeded',
        };
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
      if (!config.accessToken && !config.apiKey) {
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
      // Test by fetching calendar list
      const response = await this.makeApiCall('/users/me/calendarList');
      
      if (response.ok) {
        return {
          success: true,
          data: { message: 'Google Calendar connection successful' },
        };
      } else {
        return {
          success: false,
          error: 'Failed to connect to Google Calendar',
        };
      }
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async scheduleMeeting(payload: any): Promise<IntegrationResult> {
    try {
      const { title, description, startTime, endTime, attendees, location } = payload;

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
        attendees: attendees?.map((email: string) => ({ email })),
      };

      const calendarId = this.calendarIntegration.config.calendarId || 'primary';
      const response = await this.makeApiCall(
        `/calendars/${calendarId}/events`,
        'POST',
        event
      );

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          data: {
            eventId: data.id,
            htmlLink: data.htmlLink,
            message: `Meeting scheduled successfully`,
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
      
      const calendarId = this.calendarIntegration.config.calendarId || 'primary';
      const timeMin = new Date(startTime).toISOString();
      const timeMax = new Date(endTime).toISOString();

      // Get busy times
      const response = await this.makeApiCall(
        `/freeBusy`,
        'POST',
        {
          timeMin,
          timeMax,
          items: [{ id: calendarId }],
        }
      );

      if (response.ok) {
        const data = await response.json();
        const busyTimes = data.calendars[calendarId]?.busy || [];
        
        // Calculate available slots
        const availableSlots = this.calculateAvailableSlots(
          new Date(startTime),
          new Date(endTime),
          busyTimes,
          duration
        );

        return {
          success: true,
          data: {
            availableSlots,
            busyTimes,
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
      
      const calendarId = this.calendarIntegration.config.calendarId || 'primary';
      const response = await this.makeApiCall(
        `/calendars/${calendarId}/events/${eventId}?sendNotifications=${sendNotifications}`,
        'DELETE'
      );

      if (response.ok || response.status === 204) {
        return {
          success: true,
          data: { message: 'Meeting cancelled successfully' },
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
      
      const calendarId = this.calendarIntegration.config.calendarId || 'primary';
      
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
            message: 'Meeting updated successfully',
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
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Use access token if available, otherwise use API key
    if (config.accessToken) {
      headers['Authorization'] = `Bearer ${config.accessToken}`;
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