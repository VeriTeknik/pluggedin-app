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
          console.log(`[WorkflowExecutor] Processing task: ${task.title} (${task.type})`);
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

      switch (task.type) {
        case 'gather':
          // Data gathering tasks - check if data is already available
          return await this.executeGatherTask(task, workflow, conversation);
          
        case 'execute':
          // Action execution tasks
          return await this.executeActionTask(task, workflow, conversation);
          
        case 'validate':
          // Validation tasks
          return await this.executeValidationTask(task, workflow, conversation);
          
        case 'confirm':
          // Confirmation tasks - for now, auto-confirm if data is complete
          return await this.executeConfirmTask(task, workflow, conversation);
          
        default:
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
      if (!workflowData[field]) {
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
    
    console.log('[WorkflowExecutor] executeActionTask with data:', {
      taskId: task.id,
      taskTitle: task.title,
      hasExistingData: !!workflow.context?.existingData,
      dataKeys: Object.keys(workflowData)
    });
    
    // Handle specific action types
    if (task.id === 'check_availability' || task.title?.includes('availability')) {
      return await this.checkCalendarAvailability(workflowData);
    }
    
    if (task.id === 'book_meeting' || task.title?.includes('Book')) {
      return await this.bookMeeting(workflowData);
    }
    
    // Default success for other action types
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
    console.log('[WorkflowExecutor] bookMeeting called with data:', data);
    
    if (!this.config.integrationManager) {
      console.error('[WorkflowExecutor] No integration manager available');
      return { success: false, error: 'No integration manager available' };
    }

    try {
      console.log('[WorkflowExecutor] Executing schedule_meeting action');
      
      const result = await this.config.integrationManager.executeAction({
        type: 'schedule_meeting',
        payload: {
          title: data.title || 'Meeting',
          startTime: data.startTime,
          endTime: data.endTime,
          attendees: data.attendees || [],
          description: data.description,
          location: data.location,
          includeGoogleMeet: data.includeGoogleMeet
        }
      });

      console.log('[WorkflowExecutor] Booking result:', result);
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