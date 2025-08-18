import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { 
  conversationWorkflowsTable, 
  workflowTasksTable,
  chatConversationsTable 
} from '@/db/schema';
import { IntegrationManager } from '@/lib/integrations/base-service';

interface WorkflowExecutorConfig {
  workflowId: string;
  conversationId: string;
  integrationManager?: IntegrationManager;
  debug?: boolean;
}

export class WorkflowExecutor {
  private config: WorkflowExecutorConfig;
  
  constructor(config: WorkflowExecutorConfig) {
    this.config = config;
  }

  /**
   * Execute the workflow by automatically progressing through steps
   */
  async execute(): Promise<{ success: boolean; error?: string }> {
    try {
      const workflow = await this.getWorkflow();
      if (!workflow) {
        return { success: false, error: 'Workflow not found' };
      }

      // Get conversation data for context
      const conversation = await db.query.chatConversationsTable.findFirst({
        where: eq(chatConversationsTable.uuid, this.config.conversationId)
      });

      // Process each task in sequence
      const tasks = workflow.tasks || [];
      
      for (const task of tasks) {
        if (task.status === 'completed') {
          continue; // Skip completed tasks
        }

        if (this.config.debug) {
          console.log(`[WorkflowExecutor] Processing task: ${task.title} (${task.task_type})`);
        }

        // Check if dependencies are met
        if (task.dependsOn && task.dependsOn.length > 0) {
          const dependencyMet = await this.checkDependencies(task.dependsOn, tasks);
          if (!dependencyMet) {
            if (this.config.debug) {
              console.log(`[WorkflowExecutor] Dependencies not met for task: ${task.title}`);
            }
            continue;
          }
        }

        // Execute the task based on its type
        const result = await this.executeTask(task, workflow, conversation);
        
        if (!result.success) {
          // Mark task as failed and stop execution
          await this.updateTaskStatus(task.id, 'failed');
          return { success: false, error: result.error };
        }

        // Mark task as completed
        await this.updateTaskStatus(task.id, 'completed');
      }

      // Update workflow status to completed if all tasks are done
      const allCompleted = tasks.every(t => t.status === 'completed');
      if (allCompleted) {
        await this.updateWorkflowStatus('completed');
      }

      return { success: true };
    } catch (error) {
      console.error('[WorkflowExecutor] Error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Execute a specific task based on its type
   */
  private async executeTask(
    task: any, 
    workflow: any, 
    conversation: any
  ): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      // Mark task as active
      await this.updateTaskStatus(task.id, 'active');

      console.log(`[WorkflowExecutor] executeTask - task details:`, {
        id: task.id,
        title: task.title,
        task_type: task.task_type,
        status: task.status
      });

      switch (task.task_type) {
        case 'gather':
          // Data gathering tasks - check if data is already available
          return await this.executeGatherTask(task, workflow, conversation);
          
        case 'execute':
          // Action execution tasks
          console.log('[WorkflowExecutor] Executing action task');
          return await this.executeActionTask(task, workflow, conversation);
          
        case 'validate':
          // Validation tasks
          return await this.executeValidationTask(task, workflow, conversation);
          
        case 'confirm':
          // Confirmation tasks - for now, auto-confirm if data is complete
          return await this.executeConfirmTask(task, workflow, conversation);
          
        default:
          console.log(`[WorkflowExecutor] Unknown task type: ${task.task_type}`);
          return { success: true }; // Unknown task types are considered successful
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Task execution failed' 
      };
    }
  }

  /**
   * Execute a gather task - check if required data is available
   */
  private async executeGatherTask(task: any, workflow: any, conversation: any): Promise<{ success: boolean; error?: string; data?: any }> {
    // Check if required data is available in workflow context (existingData has the actual values)
    const requiredData = task.requiredData || [];
    const workflowData = workflow.context?.existingData || workflow.context || {};
    
    for (const field of requiredData) {
      const value = workflowData[field];
      const isMissing =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim().length === 0) ||
        (Array.isArray(value) && value.length === 0);
      if (isMissing) {
        return {
          success: false,
          error: `Missing required data: ${field}`
        };
      }
    }
    
    return { success: true };
  }

  /**
   * Execute an action task (e.g., check availability, book meeting)
   */
  private async executeActionTask(task: any, workflow: any, conversation: any): Promise<{ success: boolean; error?: string; data?: any }> {
    // Get data from workflow.context.existingData (where the actual meeting details are stored)
    const workflowData = workflow.context?.existingData || workflow.context || {};
    
    console.log('[WorkflowExecutor] executeActionTask called:', {
      taskId: task.id,
      taskTitle: task.title,
      taskType: task.task_type,
      hasExistingData: !!workflow.context?.existingData,
      dataKeys: Object.keys(workflowData),
      fullWorkflowData: JSON.stringify(workflowData, null, 2)
    });
    
    // Handle specific action types
    if (task.id === 'check_availability' || task.title?.includes('availability')) {
      console.log('[WorkflowExecutor] Calling checkCalendarAvailability');
      return await this.checkCalendarAvailability(workflowData);
    }
    
    if (task.id === 'book_meeting' || task.title?.includes('Book')) {
      console.log('[WorkflowExecutor] Calling bookMeeting with data:', JSON.stringify(workflowData, null, 2));
      const result = await this.bookMeeting(workflowData);
      console.log('[WorkflowExecutor] bookMeeting returned:', JSON.stringify(result, null, 2));
      return result;
    }
    
    // Default success for other action types
    console.log('[WorkflowExecutor] No specific handler for task, returning default success');
    return { success: true };
  }

  /**
   * Check calendar availability to prevent double bookings
   */
  private async checkCalendarAvailability(data: any): Promise<{ success: boolean; error?: string; data?: any }> {
    if (!this.config.integrationManager) {
      // If no integration manager, assume availability is OK
      return { success: true, data: { available: true } };
    }

    try {
      // Use the integration manager to check availability
      const result = await this.config.integrationManager.executeAction({
        type: 'check_availability',
        payload: {
          startTime: data.startTime,
          endTime: data.endTime,
          duration: data.duration || 60
        }
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Check if there are conflicts
      const hasConflicts = result.data?.conflicts && result.data.conflicts.length > 0;
      
      if (hasConflicts) {
        return { 
          success: false, 
          error: `Time slot is not available. Conflicts found: ${result.data.conflicts.map((c: any) => c.summary).join(', ')}` 
        };
      }

      return { success: true, data: { available: true } };
    } catch (error) {
      console.error('[WorkflowExecutor] Availability check error:', error);
      return { 
        success: false, 
        error: 'Failed to check calendar availability' 
      };
    }
  }

  /**
   * Book the meeting using the calendar integration
   */
  private async bookMeeting(data: any): Promise<{ success: boolean; error?: string; data?: any }> {
    console.log('[WorkflowExecutor] bookMeeting called with data:', JSON.stringify(data, null, 2));
    
    if (!this.config.integrationManager) {
      console.error('[WorkflowExecutor] No integration manager available');
      return { success: false, error: 'No integration manager available' };
    }

    // Log integration manager state to debug
    console.log('[WorkflowExecutor] Integration manager state:', {
      hasIntegrationManager: !!this.config.integrationManager,
      availableCapabilities: this.config.integrationManager.getAvailableCapabilities?.()?.map(c => c.id),
      integrationsSize: (this.config.integrationManager as any).integrations?.size,
      hasCalendarService: (this.config.integrationManager as any).integrations?.has('calendar'),
      personaId: (this.config.integrationManager as any).personaId
    });

    try {
      // Hard guard: do not proceed without attendees
      if (!Array.isArray(data.attendees) || data.attendees.length === 0) {
        return { success: false, error: 'Cannot book meeting without attendees' };
      }
      console.log('[WorkflowExecutor] Executing schedule_meeting action with payload:', {
        title: data.title || 'Meeting',
        startTime: data.startTime,
        endTime: data.endTime,
        attendees: data.attendees || [],
        description: data.description,
        location: data.location,
        includeGoogleMeet: data.includeGoogleMeet
      });
      
      // Get organizer info from integration manager or workflow context
      const organizerInfo = {
        email: (this.config.integrationManager as any).userEmail || 
               data.organizerEmail || 
               'cem.karaca@gmail.com' // Your email as fallback
      };
      
      const result = await this.config.integrationManager.executeAction({
        type: 'schedule_meeting',
        payload: {
          title: data.title || 'Meeting',
          startTime: data.startTime,
          endTime: data.endTime,
          attendees: data.attendees || [],
          description: data.description,
          location: data.location,
          includeGoogleMeet: data.includeGoogleMeet,
          organizerInfo: organizerInfo
        }
      });

      console.log('[WorkflowExecutor] Booking result:', JSON.stringify(result, null, 2));
      
      // Send notifications if booking was successful
      if (result.success && this.config.integrationManager) {
        // Check for services directly instead of capabilities
        const slackService = this.config.integrationManager.getService?.('slack');
        const emailService = this.config.integrationManager.getService?.('email');
        const hasSlack = !!slackService;
        const hasEmail = !!emailService;
        
        console.log('[WorkflowExecutor] Notification services available:', {
          hasSlack,
          hasEmail,
          slackService: slackService?.constructor?.name,
          emailService: emailService?.constructor?.name
        });
        
        const meetingDetails = {
          title: data.title || 'Meeting',
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          duration: Math.round((new Date(data.endTime).getTime() - new Date(data.startTime).getTime()) / 60000),
          attendees: data.attendees || [],
          location: data.location,
          calendarLink: result.data?.htmlLink,
          meetLink: result.data?.meetLink
        };
        
        // Send Slack notification
        if (hasSlack) {
          console.log('[WorkflowExecutor] Attempting to send Slack notification');
          try {
            const slackMessage = `📅 Meeting Scheduled!\n` +
              `*Title:* ${meetingDetails.title}\n` +
              `*Date/Time:* ${meetingDetails.startTime.toLocaleString()}\n` +
              `*Duration:* ${meetingDetails.duration} minutes\n` +
              `*Attendees:* ${meetingDetails.attendees.join(', ') || 'None specified'}\n` +
              `*Organizer:* ${organizerInfo.email}\n` +
              `${meetingDetails.location ? `*Location:* ${meetingDetails.location}\n` : ''}` +
              `${meetingDetails.calendarLink ? `*Calendar Link:* ${meetingDetails.calendarLink}\n` : ''}` +
              `${meetingDetails.meetLink ? `*Meeting Link:* ${meetingDetails.meetLink}` : ''}`;
            
            console.log('[WorkflowExecutor] Slack message prepared:', slackMessage);
            
            const slackResult = await this.config.integrationManager.executeAction({
              type: 'send_slack',
              payload: {
                text: slackMessage
              }
            });
            
            console.log('[WorkflowExecutor] Slack notification result:', JSON.stringify(slackResult, null, 2));
            
            if (!slackResult.success) {
              console.error('[WorkflowExecutor] Slack notification failed:', slackResult.error);
            }
          } catch (slackError) {
            console.error('[WorkflowExecutor] Slack notification error:', slackError);
          }
        } else {
          console.log('[WorkflowExecutor] Slack service not available, skipping Slack notification');
        }
        
        // Send email invitations to attendees (since Google Calendar API can't with our limited scope)
        if (hasEmail && meetingDetails.attendees.length > 0) {
          console.log('[WorkflowExecutor] Preparing to send email invitations to:', meetingDetails.attendees);
          for (const attendeeEmail of meetingDetails.attendees) {
            try {
              const emailBody = `
                <h2>Meeting Invitation: ${meetingDetails.title}</h2>
                <p>You have been invited to a meeting by <strong>${organizerInfo.email}</strong>.</p>
                <ul>
                  <li><strong>Date/Time:</strong> ${meetingDetails.startTime.toLocaleString()}</li>
                  <li><strong>Duration:</strong> ${meetingDetails.duration} minutes</li>
                  <li><strong>Organizer:</strong> ${organizerInfo.email}</li>
                  ${meetingDetails.location ? `<li><strong>Location:</strong> ${meetingDetails.location}</li>` : ''}
                  ${meetingDetails.meetLink ? `<li><strong>Meeting Link:</strong> <a href="${meetingDetails.meetLink}">${meetingDetails.meetLink}</a></li>` : ''}
                </ul>
                ${data.description ? `<p><strong>Description:</strong><br>${data.description}</p>` : ''}
                <p><a href="${meetingDetails.calendarLink}">Add to Google Calendar</a></p>
                <hr>
                <p><small>This invitation was sent via Plugged.in</small></p>
              `;
              
              console.log(`[WorkflowExecutor] Sending email to ${attendeeEmail}`);
              
              const emailResult = await this.config.integrationManager.executeAction({
                type: 'send_email',
                payload: {
                  to: attendeeEmail,
                  subject: `Meeting Invitation: ${meetingDetails.title}`,
                  html: emailBody
                }
              });
              
              console.log(`[WorkflowExecutor] Email result for ${attendeeEmail}:`, JSON.stringify(emailResult, null, 2));
              
              if (!emailResult.success) {
                console.error(`[WorkflowExecutor] Email failed for ${attendeeEmail}:`, emailResult.error);
              }
            } catch (emailError) {
              console.error(`[WorkflowExecutor] Email error for ${attendeeEmail}:`, emailError);
            }
          }
        } else {
          console.log('[WorkflowExecutor] Email service not available or no attendees, skipping email notifications');
        }
      }
      
      return result;
    } catch (error) {
      console.error('[WorkflowExecutor] Booking error:', error);
      return { 
        success: false, 
        error: 'Failed to book meeting' 
      };
    }
  }

  /**
   * Execute validation task
   */
  private async executeValidationTask(task: any, workflow: any, conversation: any): Promise<{ success: boolean; error?: string }> {
    // Validate data format, check constraints, etc.
    const workflowData = workflow.context?.existingData || workflow.context || {};
    
    // Basic validation for meeting data
    if (workflow.template_id === 'meeting_scheduler') {
      if (workflowData.startTime && workflowData.endTime) {
        const start = new Date(workflowData.startTime);
        const end = new Date(workflowData.endTime);
        
        if (end <= start) {
          return { success: false, error: 'End time must be after start time' };
        }
      }
    }
    
    return { success: true };
  }

  /**
   * Execute confirmation task
   */
  private async executeConfirmTask(task: any, workflow: any, conversation: any): Promise<{ success: boolean; error?: string }> {
    // For now, auto-confirm if all required data is present
    // In the future, this could wait for user confirmation
    return { success: true };
  }

  /**
   * Check if task dependencies are met
   */
  private async checkDependencies(dependsOn: string[], tasks: any[]): Promise<boolean> {
    for (const depId of dependsOn) {
      const depTask = tasks.find(t => t.id === depId);
      if (!depTask || depTask.status !== 'completed') {
        return false;
      }
    }
    return true;
  }

  /**
   * Get the workflow instance with tasks
   */
  private async getWorkflow() {
    const workflow = await db.query.conversationWorkflowsTable.findFirst({
      where: eq(conversationWorkflowsTable.id, this.config.workflowId),
      with: {
        tasks: {
          orderBy: (tasks, { asc }) => [asc(tasks.created_at)]
        }
      }
    });
    
    return workflow;
  }

  /**
   * Update task status
   */
  private async updateTaskStatus(taskId: string, status: string) {
    await db
      .update(workflowTasksTable)
      .set({ 
        status,
        updated_at: new Date()
      })
      .where(eq(workflowTasksTable.id, taskId));
  }

  /**
   * Update workflow status
   */
  private async updateWorkflowStatus(status: string) {
    await db
      .update(conversationWorkflowsTable)
      .set({ 
        status,
        updated_at: new Date()
      })
      .where(eq(conversationWorkflowsTable.id, this.config.workflowId));
  }
}