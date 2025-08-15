import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkflowBrain } from '@/lib/workflows/workflow-brain';
import { InformationOrchestrator } from '@/lib/workflows/info-orchestrator';
import { db } from '@/db';
import { 
  conversationWorkflowsTable, 
  workflowTasksTable,
  conversationTasksTable,
  chatConversationsTable 
} from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('Workflow Integration System', () => {
  let workflowBrain: WorkflowBrain;
  let infoOrchestrator: InformationOrchestrator;
  let testConversationId: string;

  beforeAll(async () => {
    workflowBrain = new WorkflowBrain();
    infoOrchestrator = new InformationOrchestrator();
    
    // Create a test conversation
    const result = await db.insert(chatConversationsTable)
      .values({
        uuid: `test-conv-${Date.now()}`,
        embedded_chat_uuid: 'test-chat',
        user_id: 'test-user',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning();
    
    testConversationId = result[0].uuid;
  });

  afterAll(async () => {
    // Clean up test data
    if (testConversationId) {
      await db.delete(conversationTasksTable)
        .where(eq(conversationTasksTable.conversation_id, testConversationId));
      await db.delete(chatConversationsTable)
        .where(eq(chatConversationsTable.uuid, testConversationId));
    }
  });

  describe('Workflow Detection', () => {
    it('should detect meeting scheduling workflow need', async () => {
      const template = await workflowBrain.detectWorkflowNeed(
        'I need to schedule a meeting with the team next week'
      );
      
      expect(template).not.toBeNull();
      expect(template?.id).toBe('meeting_scheduler');
      expect(template?.name).toBe('Schedule Meeting');
    });

    it('should detect support ticket workflow need', async () => {
      const template = await workflowBrain.detectWorkflowNeed(
        'I need help with a technical issue'
      );
      
      expect(template).not.toBeNull();
      expect(template?.id).toBe('support_ticket');
    });

    it('should detect lead creation workflow need', async () => {
      const template = await workflowBrain.detectWorkflowNeed(
        'Add John Doe from Acme Corp as a new lead'
      );
      
      expect(template).not.toBeNull();
      expect(template?.id).toBe('lead_capture');
    });

    it('should return null for non-workflow messages', async () => {
      const template = await workflowBrain.detectWorkflowNeed(
        'What is the weather today?'
      );
      
      expect(template).toBeNull();
    });
  });

  describe('Workflow Generation', () => {
    it('should generate a complete meeting workflow', async () => {
      const template = await workflowBrain.detectWorkflowNeed(
        'Schedule a meeting with Sarah'
      );
      
      expect(template).not.toBeNull();
      
      const context = {
        conversationId: testConversationId,
        userId: 'test-user',
        existingData: {},
        memories: [],
        capabilities: ['schedule_meeting', 'send_email'],
        timezone: 'America/New_York',
        language: 'en'
      };
      
      const workflow = await workflowBrain.generateWorkflow(template!, context);
      
      expect(workflow).toBeDefined();
      expect(workflow.template_id).toBe('meeting_scheduler');
      expect(workflow.conversation_id).toBe(testConversationId);
      expect(workflow.status).toBe('active');
      expect(workflow.steps).toBeInstanceOf(Array);
      expect(workflow.steps.length).toBeGreaterThan(0);
      
      // Check that tasks were created
      const tasks = await db.select()
        .from(workflowTasksTable)
        .where(eq(workflowTasksTable.workflow_id, workflow.id));
      
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.some(t => t.task_type === 'collect_attendees')).toBe(true);
      expect(tasks.some(t => t.task_type === 'collect_time')).toBe(true);
    });

    it('should generate workflow with existing data', async () => {
      const template = await workflowBrain.detectWorkflowNeed(
        'Create a support ticket'
      );
      
      const context = {
        conversationId: testConversationId,
        userId: 'test-user',
        existingData: {
          title: 'Login issue',
          userEmail: 'user@example.com'
        },
        memories: [],
        capabilities: ['create_ticket'],
        timezone: 'UTC',
        language: 'en'
      };
      
      const workflow = await workflowBrain.generateWorkflow(template!, context);
      
      expect(workflow).toBeDefined();
      expect(workflow.context.existingData).toHaveProperty('title', 'Login issue');
      expect(workflow.context.existingData).toHaveProperty('userEmail', 'user@example.com');
    });
  });

  describe('Information Orchestration', () => {
    it('should identify missing information for meeting', async () => {
      const workflow = {
        id: 'test-workflow',
        template_id: 'meeting_scheduler',
        conversation_id: testConversationId,
        context: {
          existingData: {
            title: 'Team Sync'
          }
        }
      };
      
      const missingInfo = await infoOrchestrator.identifyMissingInfo(
        workflow,
        'collect_attendees'
      );
      
      expect(missingInfo).toBeInstanceOf(Array);
      expect(missingInfo.length).toBeGreaterThan(0);
      expect(missingInfo.some(info => info.field === 'attendees')).toBe(true);
    });

    it('should generate natural prompts for missing info', async () => {
      const requirement = {
        field: 'attendees',
        type: 'email_list' as const,
        description: 'List of attendee emails',
        required: true
      };
      
      const prompt = await infoOrchestrator.generatePrompt(requirement, {
        purpose: 'Schedule Meeting',
        action: 'scheduling a team sync'
      });
      
      expect(prompt).toBeDefined();
      expect(prompt.message).toContain('email');
      expect(prompt.type).toBe('question');
      expect(prompt.expectsResponse).toBe(true);
    });

    it('should validate collected information', async () => {
      const validation = await infoOrchestrator.validateInformation(
        'email',
        'user@example.com'
      );
      
      expect(validation.valid).toBe(true);
      expect(validation.normalizedValue).toBe('user@example.com');
    });

    it('should reject invalid email', async () => {
      const validation = await infoOrchestrator.validateInformation(
        'email',
        'not-an-email'
      );
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('valid email');
    });
  });

  describe('Workflow Task Management', () => {
    it('should get next task in workflow', async () => {
      const template = await workflowBrain.detectWorkflowNeed(
        'Schedule a meeting'
      );
      
      const context = {
        conversationId: testConversationId,
        userId: 'test-user',
        existingData: {},
        memories: [],
        capabilities: ['schedule_meeting'],
        timezone: 'UTC',
        language: 'en'
      };
      
      const workflow = await workflowBrain.generateWorkflow(template!, context);
      const nextTask = await workflowBrain.getNextTask(workflow.id);
      
      expect(nextTask).not.toBeNull();
      expect(nextTask?.status).toBe('pending');
    });

    it('should update task status', async () => {
      const template = await workflowBrain.detectWorkflowNeed(
        'Create a lead'
      );
      
      const context = {
        conversationId: testConversationId,
        userId: 'test-user',
        existingData: {},
        memories: [],
        capabilities: ['create_lead'],
        timezone: 'UTC',
        language: 'en'
      };
      
      const workflow = await workflowBrain.generateWorkflow(template!, context);
      const task = await workflowBrain.getNextTask(workflow.id);
      
      expect(task).not.toBeNull();
      
      // Update task to active
      await db.update(workflowTasksTable)
        .set({ status: 'active', started_at: new Date() })
        .where(eq(workflowTasksTable.id, task!.id));
      
      // Complete the task
      const success = await workflowBrain.completeTask(task!.id, {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      });
      
      expect(success).toBe(true);
      
      // Verify task is completed
      const updatedTask = await db.query.workflowTasksTable.findFirst({
        where: eq(workflowTasksTable.id, task!.id)
      });
      
      expect(updatedTask?.status).toBe('completed');
      expect(updatedTask?.completed_at).not.toBeNull();
    });
  });

  describe('Conversation Task Integration', () => {
    it('should create conversation tasks from workflow', async () => {
      const workflowTask = {
        id: 'workflow-task-1',
        title: 'Collect meeting details',
        description: 'Get attendees and time for the meeting'
      };
      
      const result = await db.insert(conversationTasksTable)
        .values({
          conversation_id: testConversationId,
          title: workflowTask.title,
          description: workflowTask.description,
          workflow_task_id: workflowTask.id,
          is_workflow_generated: true,
          workflow_metadata: {
            template: 'meeting_scheduler',
            step: 1
          },
          status: 'todo',
          priority: 'medium',
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning();
      
      const conversationTask = result[0];
      
      expect(conversationTask).toBeDefined();
      expect(conversationTask.workflow_task_id).toBe(workflowTask.id);
      expect(conversationTask.is_workflow_generated).toBe(true);
      expect(conversationTask.workflow_metadata).toHaveProperty('template', 'meeting_scheduler');
    });
  });
});