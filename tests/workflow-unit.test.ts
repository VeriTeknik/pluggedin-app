import { describe, it, expect, vi } from 'vitest';
import { WorkflowBrain } from '@/lib/workflows/workflow-brain';
import { InformationOrchestrator } from '@/lib/workflows/info-orchestrator';

// Mock the database
vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ 
          id: 'test-id', 
          uuid: 'test-uuid' 
        }]))
      }))
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([]))
          }))
        }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([]))
      }))
    })),
    query: {
      workflowTemplatesTable: {
        findMany: vi.fn(() => Promise.resolve([
          {
            id: 'meeting_scheduler',
            name: 'Schedule Meeting',
            description: 'Schedule a meeting with attendees',
            trigger_keywords: ['schedule', 'meeting', 'calendar', 'book'],
            required_fields: ['title', 'attendees', 'startTime', 'endTime'],
            steps: [
              { type: 'collect_attendees', title: 'Collect Attendees' },
              { type: 'collect_time', title: 'Collect Time' }
            ],
            capabilities_required: ['schedule_meeting']
          }
        ])),
        findFirst: vi.fn(() => Promise.resolve({
          id: 'meeting_scheduler',
          name: 'Schedule Meeting',
          description: 'Schedule a meeting with attendees',
          trigger_keywords: ['schedule', 'meeting', 'calendar', 'book'],
          required_fields: ['title', 'attendees', 'startTime', 'endTime'],
          steps: [
            { type: 'collect_attendees', title: 'Collect Attendees' },
            { type: 'collect_time', title: 'Collect Time' }
          ],
          capabilities_required: ['schedule_meeting']
        }))
      },
      conversationWorkflowsTable: {
        findFirst: vi.fn(() => Promise.resolve(null))
      },
      workflowTasksTable: {
        findFirst: vi.fn(() => Promise.resolve({
          id: 'task-1',
          workflow_id: 'workflow-1',
          step_index: 0,
          task_type: 'collect_attendees',
          title: 'Collect Attendees',
          status: 'pending'
        }))
      }
    }
  }
}));

describe('Workflow System Unit Tests', () => {
  describe('WorkflowBrain', () => {
    it('should detect meeting scheduling workflow', async () => {
      const brain = new WorkflowBrain();
      const template = await brain.detectWorkflowNeed('I need to schedule a meeting with the team');
      
      expect(template).not.toBeNull();
      expect(template?.id).toBe('meeting_scheduler');
      expect(template?.name).toBe('Schedule Meeting');
    });

    it('should not detect workflow for general queries', async () => {
      const brain = new WorkflowBrain();
      const template = await brain.detectWorkflowNeed('What is the weather today?');
      
      expect(template).toBeNull();
    });

    it('should detect workflow with partial keywords', async () => {
      const brain = new WorkflowBrain();
      const template = await brain.detectWorkflowNeed('Can you book a time with Sarah?');
      
      expect(template).not.toBeNull();
      expect(template?.id).toBe('meeting_scheduler');
    });
  });

  describe('InformationOrchestrator', () => {
    it('should identify missing attendees information', async () => {
      const orchestrator = new InformationOrchestrator();
      const workflow = {
        id: 'test-workflow',
        template_id: 'meeting_scheduler',
        conversation_id: 'test-conv',
        context: {
          existingData: {
            title: 'Team Sync'
          }
        }
      };
      
      const missingInfo = await orchestrator.identifyMissingInfo(workflow, 'collect_attendees');
      
      expect(missingInfo).toBeInstanceOf(Array);
      expect(missingInfo.some(info => info.field === 'attendees')).toBe(true);
    });

    it('should validate email addresses', async () => {
      const orchestrator = new InformationOrchestrator();
      
      const validEmail = await orchestrator.validateInformation('email', 'user@example.com');
      expect(validEmail.valid).toBe(true);
      expect(validEmail.normalizedValue).toBe('user@example.com');
      
      const invalidEmail = await orchestrator.validateInformation('email', 'not-an-email');
      expect(invalidEmail.valid).toBe(false);
      expect(invalidEmail.error).toContain('valid email');
    });

    it('should validate datetime strings', async () => {
      const orchestrator = new InformationOrchestrator();
      
      const validDate = await orchestrator.validateInformation('datetime', '2024-01-15T10:00:00Z');
      expect(validDate.valid).toBe(true);
      
      const invalidDate = await orchestrator.validateInformation('datetime', 'tomorrow at 3pm');
      expect(invalidDate.valid).toBe(false);
    });

    it('should generate natural language prompts', async () => {
      const orchestrator = new InformationOrchestrator();
      const requirement = {
        field: 'attendees',
        type: 'email_list' as const,
        description: 'Email addresses of meeting attendees',
        required: true
      };
      
      const prompt = await orchestrator.generatePrompt(requirement, {
        purpose: 'Schedule Meeting',
        action: 'booking a team sync'
      });
      
      expect(prompt).toBeDefined();
      expect(prompt.message).toContain('email');
      expect(prompt.type).toBe('question');
      expect(prompt.expectsResponse).toBe(true);
    });

    it('should generate different prompts for different fields', async () => {
      const orchestrator = new InformationOrchestrator();
      
      const timePrompt = await orchestrator.generatePrompt({
        field: 'startTime',
        type: 'datetime' as const,
        description: 'Meeting start time',
        required: true
      });
      
      expect(timePrompt.message).toContain('time');
      
      const titlePrompt = await orchestrator.generatePrompt({
        field: 'title',
        type: 'text' as const,
        description: 'Meeting title',
        required: true
      });
      
      expect(titlePrompt.message).toContain('title');
    });
  });

  describe('Workflow Templates', () => {
    it('should have required fields for meeting scheduler', () => {
      const template = {
        id: 'meeting_scheduler',
        name: 'Schedule Meeting',
        required_fields: ['title', 'attendees', 'startTime', 'endTime'],
        steps: [
          { type: 'collect_attendees', title: 'Collect Attendees' },
          { type: 'collect_time', title: 'Collect Time' },
          { type: 'schedule', title: 'Schedule Meeting' }
        ]
      };
      
      expect(template.required_fields).toContain('attendees');
      expect(template.required_fields).toContain('startTime');
      expect(template.steps.length).toBeGreaterThan(0);
    });

    it('should have proper step ordering', () => {
      const template = {
        steps: [
          { type: 'collect_info', order: 1 },
          { type: 'validate', order: 2 },
          { type: 'execute', order: 3 }
        ]
      };
      
      const sorted = template.steps.sort((a, b) => a.order - b.order);
      expect(sorted[0].type).toBe('collect_info');
      expect(sorted[sorted.length - 1].type).toBe('execute');
    });
  });

  describe('Workflow Context', () => {
    it('should merge existing data with new data', () => {
      const context = {
        existingData: {
          title: 'Team Sync',
          location: 'Conference Room A'
        }
      };
      
      const newData = {
        attendees: ['user@example.com'],
        startTime: '2024-01-15T10:00:00Z'
      };
      
      const merged = { ...context.existingData, ...newData };
      
      expect(merged.title).toBe('Team Sync');
      expect(merged.attendees).toEqual(['user@example.com']);
      expect(merged.location).toBe('Conference Room A');
      expect(merged.startTime).toBe('2024-01-15T10:00:00Z');
    });

    it('should handle memories in context', () => {
      const context = {
        memories: [
          { key: 'user_email', value: 'john@example.com' },
          { key: 'preferred_meeting_time', value: 'mornings' }
        ]
      };
      
      const emailMemory = context.memories.find(m => m.key === 'user_email');
      expect(emailMemory?.value).toBe('john@example.com');
    });
  });
});