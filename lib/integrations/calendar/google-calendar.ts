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
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
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
  private tokenExpiryTime: number = 0;
  private personaId?: number;

  constructor(integration: CalendarIntegration, personaId?: number) {
    super(integration);
    // Don't log sensitive tokens - only log structure
    const safeIntegration = {
      enabled: integration?.enabled,
      provider: integration?.provider,
      config: {
        hasAccessToken: !!integration?.config?.accessToken,
        hasRefreshToken: !!integration?.config?.refreshToken,
        hasApiKey: !!integration?.config?.apiKey
      }
    };
    console.log('[GoogleCalendarService] Received integration:', JSON.stringify(safeIntegration, null, 2));
    this.calendarIntegration = integration;
    this.personaId = personaId;
    console.log('[GoogleCalendarService] Persona ID:', personaId);
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = this.calendarIntegration.config?.refreshToken;
    if (!refreshToken) {
      throw new Error('No refresh token available. Please reconnect your Google Calendar.');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[GoogleCalendarService] Missing Google OAuth credentials in environment variables');
      throw new Error('Google OAuth is not configured. Please contact support.');
    }

    console.log('[GoogleCalendarService] Refreshing access token...');

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });

      const data = await response.json();
      
      if (data.error) {
        console.error('[GoogleCalendarService] Token refresh error:', data);
        throw new Error(`Failed to refresh token: ${data.error_description || data.error}`);
      }

      if (data.access_token) {
        console.log('[GoogleCalendarService] Successfully refreshed access token');
        // Update the token in memory
        this.calendarIntegration.config.accessToken = data.access_token;
        // Set token expiry time (usually 1 hour from now)
        this.tokenExpiryTime = Date.now() + ((data.expires_in || 3600) * 1000) - 60000; // Subtract 1 minute for safety
        
        // Save the new token to database if we have a persona ID
        if (this.personaId) {
          try {
            // Dynamic import to avoid circular dependencies
            const { updateCalendarTokens } = await import('@/app/actions/update-persona-integration');
            const result = await updateCalendarTokens(
              this.personaId,
              data.access_token,
              refreshToken // Keep the same refresh token
            );
            
            if (result.success) {
              console.log('[GoogleCalendarService] Successfully saved refreshed token to database');
            } else {
              console.error('[GoogleCalendarService] Failed to save refreshed token:', result.error);
            }
          } catch (error) {
            console.error('[GoogleCalendarService] Error saving refreshed token to database:', error);
            // Continue even if saving fails - at least the current session will work
          }
        }
        
        return data.access_token;
      }
      
      throw new Error('No access token in refresh response');
    } catch (error) {
      console.error('[GoogleCalendarService] Failed to refresh token:', error);
      throw error;
    }
  }

  private isTokenExpired(): boolean {
    // If we don't have an expiry time set, assume the token might be expired
    if (this.tokenExpiryTime === 0) {
      return true;
    }
    return Date.now() >= this.tokenExpiryTime;
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
        await this.ensurePluggedInCalendar(this.calendarIntegration.config?.userEmail);
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

  private async ensurePluggedInCalendar(userEmail?: string): Promise<string> {
    if (this.pluggedInCalendarId) {
      return this.pluggedInCalendarId;
    }

    try {
      const calendarList = await this.getCalendarList();
      const pluggedInCalendar = calendarList.find(cal => cal.summary === 'Plugged.in');

      if (pluggedInCalendar) {
        this.pluggedInCalendarId = pluggedInCalendar.id;
        console.log('[GoogleCalendarService] Using existing Plugged.in calendar:', this.pluggedInCalendarId);
        
        // Check and fix ACL for existing calendar if we have a user email
        const effectiveUserEmail = userEmail || this.calendarIntegration.config?.userEmail;
        if (effectiveUserEmail) {
          try {
            // Try to update ACL for existing calendar
            console.log('[GoogleCalendarService] Checking ACL for existing calendar for user:', effectiveUserEmail);
            const aclResponse = await this.makeApiCall(`/calendars/${this.pluggedInCalendarId}/acl`, 'GET');
            if (aclResponse.ok) {
              const aclData = await aclResponse.json();
              const hasUserAccess = aclData.items?.some((acl: any) => 
                acl.scope?.type === 'user' && acl.scope?.value === effectiveUserEmail && acl.role === 'owner'
              );
              
              if (!hasUserAccess) {
                console.log('[GoogleCalendarService] Adding proper ACL for user:', effectiveUserEmail);
                await this.makeApiCall(`/calendars/${this.pluggedInCalendarId}/acl`, 'POST', {
                  role: 'owner',
                  scope: {
                    type: 'user',
                    value: effectiveUserEmail
                  }
                });
                console.log('[GoogleCalendarService] ACL updated successfully');
              } else {
                console.log('[GoogleCalendarService] Calendar already has proper ACL for user');
              }
            }
          } catch (aclError) {
            console.log('[GoogleCalendarService] Could not check/update ACL for existing calendar:', aclError);
          }
        }
        
        return this.pluggedInCalendarId;
      }

      // Create Plugged.in calendar with notification settings
      console.log('[GoogleCalendarService] Creating new Plugged.in calendar');
      const response = await this.makeApiCall('/calendars', 'POST', {
        summary: 'Plugged.in',
        description: 'Dedicated calendar for Plugged.in meetings - Events from this calendar will be visible in your main calendar',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      });

      if (response.ok) {
        const calendar = await response.json();
        this.pluggedInCalendarId = calendar.id;
        console.log('[GoogleCalendarService] Created Plugged.in calendar:', this.pluggedInCalendarId);
        
        // Share the calendar back to the user with full permissions to ensure visibility
        // Use the passed userEmail or fall back to config
        const effectiveUserEmail = userEmail || this.calendarIntegration.config?.userEmail;
        
        if (effectiveUserEmail) {
          try {
            console.log('[GoogleCalendarService] Setting ACL for user:', effectiveUserEmail);
            await this.makeApiCall(`/calendars/${calendar.id}/acl`, 'POST', {
              role: 'owner',
              scope: {
                type: 'user',
                value: effectiveUserEmail
              }
            });
            console.log('[GoogleCalendarService] ACL set successfully for calendar');
          } catch (aclError) {
            console.log('[GoogleCalendarService] Could not set ACL:', aclError, '- continuing anyway');
          }
        } else {
          console.log('[GoogleCalendarService] No user email available for ACL, using default visibility');
          // Fallback to default visibility if no email available
          try {
            await this.makeApiCall(`/calendars/${calendar.id}/acl`, 'POST', {
              role: 'owner',
              scope: {
                type: 'default'
              }
            });
          } catch (aclError) {
            console.log('[GoogleCalendarService] Could not set default ACL, continuing anyway');
          }
        }
        
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

      // Ensure we have a Plugged.in calendar (pass userEmail for ACL setup)
      const calendarId = await this.ensurePluggedInCalendar(organizerInfo?.email || this.calendarIntegration.config?.userEmail);

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

      // Do not allow creating meetings without attendees
      if (validAttendees.length === 0) {
        console.warn('[GoogleCalendarService] Blocking event creation: no attendees provided');
        return {
          success: false,
          error: 'Cannot schedule meeting without attendees. Please provide at least one valid attendee email.'
        };
      }

      // Get organizer email - either from OAuth account or from the first user's email
      let organizerEmail = 'Organizer';
      if (organizerInfo?.email) {
        organizerEmail = organizerInfo.email;
      } else if (this.calendarIntegration.config?.userEmail) {
        organizerEmail = this.calendarIntegration.config.userEmail;
      }
      
      // Build enhanced description with organizer info
      const enhancedDescription = `Organized by: ${organizerEmail}\n\n${description || ''}`.trim();
      
      const event: GoogleCalendarEvent = {
        summary: title,
        description: enhancedDescription,
        location: location,
        start: {
          dateTime: new Date(startTime).toISOString(),
          timeZone: payload.timeZone || 'UTC',
        },
        end: {
          dateTime: new Date(endTime).toISOString(),
          timeZone: payload.timeZone || 'UTC',
        },
        attendees: validAttendees.map((email: string) => ({ 
          email,
          responseStatus: 'needsAction'  // This triggers email invitations
        })),
        // Add reminder to ensure notifications
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 15 },
            { method: 'popup', minutes: 10 }
          ]
        }
      };
      
      console.log('[GoogleCalendarService] Event object being sent to API:', {
        summary: event.summary,
        attendeesCount: event.attendees?.length || 0,
        attendees: event.attendees,
        calendarId: calendarId
      });

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
        `/calendars/${calendarId}/events?conferenceDataVersion=1&sendNotifications=true&sendUpdates=all`,
        'POST',
        event
      );

      if (response.ok) {
        const data = await response.json();
        console.log('[GoogleCalendarService] Event created successfully:', {
          eventId: data.id,
          htmlLink: data.htmlLink,
          calendarId: calendarId,
          requestedAttendees: validAttendees,
          actualAttendees: data.attendees,
          attendeesAdded: data.attendees?.length > 0
        });
        
        // Warn if attendees weren't added despite being requested
        if (validAttendees.length > 0 && (!data.attendees || data.attendees.length === 0)) {
          console.warn('[GoogleCalendarService] WARNING: Attendees were not added to the event!');
          console.warn('[GoogleCalendarService] This might be due to OAuth scope limitations (calendar.app.created)');
          console.warn('[GoogleCalendarService] Consider using broader calendar permissions or using email/Slack for invitations');
        }
        
        return {
          success: true,
          data: {
            eventId: data.id,
            htmlLink: data.htmlLink,
            meetLink: data.conferenceData?.entryPoints?.[0]?.uri,
            calendarId: calendarId,
            message: `Meeting scheduled in Plugged.in calendar${includeGoogleMeet ? ' with Google Meet' : ''}. View in Google Calendar: ${data.htmlLink}. Note: Email invitations will be sent separately if email integration is enabled.`,
          },
        };
      } else {
        const errorBody = (response as any).errorBody || await response.text();
        console.error('[GoogleCalendarService] Failed to create event:', {
          status: response.status,
          error: errorBody
        });
        
        // Parse error for better user message
        let errorMessage = 'Failed to schedule meeting';
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          // If not JSON, use the text as is
          if (errorBody) {
            errorMessage = errorBody;
          }
        }
        
        return {
          success: false,
          error: `Failed to schedule meeting: ${errorMessage}`,
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
      const calendarId = await this.ensurePluggedInCalendar(this.calendarIntegration.config?.userEmail);
      
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
      
      // Ensure we have a Plugged.in calendar
      const calendarId = await this.ensurePluggedInCalendar(this.calendarIntegration.config?.userEmail);
      
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
    body?: any,
    retryCount: number = 0
  ): Promise<Response> {
    const baseUrl = 'https://www.googleapis.com/calendar/v3';
    const config = this.calendarIntegration.config;
    
    console.log('[GoogleCalendarService] makeApiCall:', {
      endpoint,
      method,
      hasConfig: !!config,
      hasAccessToken: !!config?.accessToken,
      hasRefreshToken: !!config?.refreshToken,
      hasApiKey: !!config?.apiKey,
      retryCount
    });
    
    // Check if config exists
    if (!config) {
      throw new Error('Calendar integration is not configured. Please connect your Google Calendar account first.');
    }
    
    // Check if token needs refresh before making the call
    if (config.refreshToken && this.isTokenExpired()) {
      console.log('[GoogleCalendarService] Token expired, refreshing before API call...');
      try {
        await this.refreshAccessToken();
      } catch (error) {
        console.error('[GoogleCalendarService] Failed to refresh token:', error);
        throw new Error('Failed to refresh Google Calendar authentication. Please reconnect your calendar.');
      }
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

    const response = await fetch(url.toString(), options);
    
    // Log error details for debugging
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[GoogleCalendarService] API Error:', {
        status: response.status,
        statusText: response.statusText,
        endpoint,
        method,
        errorBody
      });
      
      // If unauthorized and we have a refresh token, try refreshing once
      if (response.status === 401 && config.refreshToken && retryCount === 0) {
        console.log('[GoogleCalendarService] Got 401, attempting token refresh...');
        try {
          await this.refreshAccessToken();
          // Retry the request with the new token
          return this.makeApiCall(endpoint, method, body, retryCount + 1);
        } catch (error) {
          console.error('[GoogleCalendarService] Token refresh failed during retry:', error);
        }
      }
      
      // Return response with error body attached for better error handling
      (response as any).errorBody = errorBody;
    }
    
    return response;
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