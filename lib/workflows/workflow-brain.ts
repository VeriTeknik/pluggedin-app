/**
 * Workflow Brain - Intelligent workflow orchestration system
 * 
 * This module provides the core intelligence for detecting when workflows are needed,
 * generating optimal workflow structures, learning from outcomes, and suggesting optimizations.
 */

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db } from '@/db';
import {
  conversationTasksTable,
  conversationWorkflowsTable,
  workflowDependenciesTable,
  workflowExecutionsTable,
  workflowLearningTable,
  workflowTasksTable,
  workflowTemplatesTable} from '@/db/schema';

// Types
export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  baseStructure: any;
  requiredCapabilities?: string[];
}

export interface WorkflowContext {
  conversationId: string;
  userId?: string;
  existingData: Record<string, any>;
  memories: any[];
  capabilities: string[];
  timezone?: string;
  language?: string;
}

export interface WorkflowStep {
  id: string;
  type: 'gather' | 'validate' | 'execute' | 'confirm' | 'decision' | 'notify';
  title: string;
  description?: string;
  requiredData?: string[];
  optionalData?: string[];
  validation?: Record<string, any>;
  dependsOn?: string[];
  critical?: boolean;
  retryOnFailure?: boolean;
}

export interface Workflow {
  id: string;
  templateId?: string;
  conversationId: string;
  status: 'planning' | 'active' | 'completed' | 'failed' | 'cancelled';
  steps: WorkflowStep[];
  context: WorkflowContext;
}

export interface Optimization {
  type: 'skip_step' | 'reorder' | 'parallel' | 'add_step' | 'modify_validation';
  description: string;
  confidence: number;
  impact: 'high' | 'medium' | 'low';
  suggestion: any;
}

export interface InfoRequirement {
  field: string;
  type: string;
  required: boolean;
  validation?: any;
  currentValue?: any;
  source?: 'user' | 'memory' | 'profile' | 'api';
}

// Workflow trigger patterns
const WORKFLOW_TRIGGERS = {
  scheduling: [
    /\b(schedule|book|arrange|set up|organize)\b.*\b(meeting|call|appointment|session|interview)\b/i,
    /\b(meeting|call|appointment)\b.*\b(with|for|at|on)\b/i,
    /\b(calendar|availability|free time|slot)\b/i,
    /\b(let'?s meet|can we meet|available to meet)\b/i
  ],
  support: [
    /\b(help|issue|problem|error|bug|broken|not working|failed|stuck)\b/i,
    /\b(support|ticket|report|complaint)\b/i,
    /\b(can'?t|unable to|having trouble|difficulty)\b/i
  ],
  communication: [
    /\b(send|email|message|notify|inform|tell|contact)\b.*\b(team|person|group|everyone)\b/i,
    /\b(announcement|update|broadcast)\b/i
  ],
  dataCollection: [
    /\b(collect|gather|survey|feedback|form|questionnaire)\b/i,
    /\b(information|data|details|requirements)\b.*\b(from|about)\b/i
  ]
};

export class WorkflowBrain {
  /**
   * Detects if a workflow is needed based on the user's message
   */
  async detectWorkflowNeed(message: string, context?: Partial<WorkflowContext>): Promise<WorkflowTemplate | null> {
    console.log('[WorkflowBrain] Analyzing message for workflow triggers:', message);
    
    // Check each workflow category for triggers
    for (const [category, patterns] of Object.entries(WORKFLOW_TRIGGERS)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          console.log(`[WorkflowBrain] Detected ${category} workflow trigger`);
          
          // Fetch the appropriate template
          const template = await this.getTemplateForCategory(category, context?.capabilities);
          if (template) {
            return template;
          }
        }
      }
    }
    
    // Use ML-based detection for complex cases (placeholder for future enhancement)
    const mlDetection = await this.mlWorkflowDetection(message, context);
    if (mlDetection) {
      return mlDetection;
    }
    
    return null;
  }

  /**
   * Generates an optimal workflow based on template and context
   */
  async generateWorkflow(
    template: WorkflowTemplate, 
    context: WorkflowContext
  ): Promise<Workflow> {
    console.log('[WorkflowBrain] Generating workflow from template:', template.name);
    
    // Use default template if the template doesn't have proper structure
    let baseStructure = template.baseStructure;
    
    // Handle various formats of baseStructure
    if (typeof baseStructure === 'string') {
      try {
        baseStructure = JSON.parse(baseStructure);
      } catch (e) {
        console.error('[WorkflowBrain] Failed to parse baseStructure string');
        baseStructure = null;
      }
    }
    
    // If no valid structure, use the default for scheduling
    if (!baseStructure || !baseStructure.steps || !Array.isArray(baseStructure.steps)) {
      console.log('[WorkflowBrain] Using default template structure for:', template.category);
      
      if (template.category === 'scheduling' || template.id === 'default-scheduling') {
        const defaultTemplate = this.getDefaultSchedulingTemplate();
        baseStructure = defaultTemplate.baseStructure;
      } else {
        console.error('[WorkflowBrain] No valid template structure and no default available');
        throw new Error('Invalid workflow template structure');
      }
    }
    
    console.log('[WorkflowBrain] Base structure:', JSON.stringify(baseStructure, null, 2));
    
    // Create the workflow record
    const workflowId = uuidv4();
    const workflow = await db.insert(conversationWorkflowsTable).values({
      id: workflowId,
      conversation_id: context.conversationId,
      template_id: template.id === 'default-scheduling' ? null : template.id,
      status: 'planning',
      context: context as any,
      created_at: new Date(),
      updated_at: new Date(),
    }).returning();
    
    // Adapt workflow based on context
    const adaptedSteps = await this.adaptWorkflowSteps(
      baseStructure.steps,
      context
    );
    
    // Create workflow tasks
    const taskMap = new Map<string, string>();
    for (const step of adaptedSteps) {
      const taskId = await this.createWorkflowTask(workflowId, step, taskMap);
      taskMap.set(step.id, taskId);
    }
    
    // Create dependencies
    for (const step of adaptedSteps) {
      if (step.dependsOn && step.dependsOn.length > 0) {
        const taskId = taskMap.get(step.id);
        if (taskId) {
          for (const depId of step.dependsOn) {
            const depTaskId = taskMap.get(depId);
            if (depTaskId) {
              await this.createDependency(taskId, depTaskId);
            }
          }
        }
      }
    }
    
    // Update workflow status to active
    await db.update(conversationWorkflowsTable)
      .set({ 
        status: 'active',
        started_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(conversationWorkflowsTable.id, workflowId));
    
    // Immediately activate the first executable task so the UI can progress
    try {
      const firstTask = await this.getNextTask(workflowId);
      if (firstTask) {
        await db.update(workflowTasksTable)
          .set({ status: 'active', started_at: new Date() })
          .where(eq(workflowTasksTable.id, firstTask.id));
      }
    } catch (e) {
      // Non-blocking: if activation fails, the workflow can still be started via execute endpoint
    }
    
    // Log workflow creation
    await this.logExecution(workflowId, null, 'workflow_created', 'system', { 
      template: template.name,
      stepsCount: adaptedSteps.length 
    });
    
    return {
      id: workflowId,
      templateId: template.id,
      conversationId: context.conversationId,
      status: 'active',
      steps: adaptedSteps,
      context
    };
  }

  /**
   * Adapts workflow steps based on available context
   */
  private async adaptWorkflowSteps(
    steps: WorkflowStep[], 
    context: WorkflowContext
  ): Promise<WorkflowStep[]> {
    // Safety check
    if (!steps || !Array.isArray(steps)) {
      console.error('[WorkflowBrain] adaptWorkflowSteps called with invalid steps:', steps);
      return [];
    }
    
    const adaptedSteps: WorkflowStep[] = [];
    const skipSteps = new Set<string>();
    
    for (const step of steps) {
      // Check if we can skip this step
      if (await this.canSkipStep(step, context)) {
        console.log(`[WorkflowBrain] Skipping step: ${step.title} - data already available`);
        skipSteps.add(step.id);
        continue;
      }
      
      // Adapt the step based on context
      const adaptedStep = await this.adaptStep(step, context);
      
      // Update dependencies to exclude skipped steps
      if (adaptedStep.dependsOn) {
        adaptedStep.dependsOn = adaptedStep.dependsOn.filter(
          depId => !skipSteps.has(depId)
        );
      }
      
      adaptedSteps.push(adaptedStep);
    }
    
    return adaptedSteps;
  }

  /**
   * Checks if a step can be skipped based on available data
   */
  private async canSkipStep(step: WorkflowStep, context: WorkflowContext): Promise<boolean> {
    if (!step.requiredData || step.requiredData.length === 0) {
      return false;
    }
    
    // Check if all required data is already available
    for (const field of step.requiredData) {
      if (!this.hasDataField(field, context)) {
        return false;
      }
    }
    
    // Special case: skip_if_known flag in step metadata
    if ((step as any).skip_if_known) {
      return true;
    }
    
    return step.type === 'gather'; // Only skip gather steps when data is available
  }

  /**
   * Checks if a data field is available in context
   */
  private hasDataField(field: string, context: WorkflowContext): boolean {
    // Check existing data
    if (context.existingData[field]) {
      return true;
    }
    
    // Check memories for the field
    const memoryFields = ['email', 'name', 'phone', 'preferences'];
    if (memoryFields.includes(field)) {
      const hasInMemory = context.memories?.some(
        m => m.type === 'user_info' && m.content[field]
      );
      if (hasInMemory) return true;
    }
    
    return false;
  }

  /**
   * Adapts a single step based on context
   */
  private async adaptStep(step: WorkflowStep, context: WorkflowContext): Promise<WorkflowStep> {
    const adapted = { ...step };
    
    // Add timezone-specific adaptations
    if (context.timezone && step.type === 'execute' && step.id.includes('schedule')) {
      (adapted as any).metadata = {
        ...((adapted as any).metadata || {}),
        timezone: context.timezone
      };
    }
    
    // Add language-specific prompts
    if (context.language && step.type === 'gather') {
      (adapted as any).metadata = {
        ...((adapted as any).metadata || {}),
        language: context.language
      };
    }
    
    return adapted;
  }

  /**
   * Creates a workflow task in the database
   */
  private async createWorkflowTask(
    workflowId: string, 
    step: WorkflowStep,
    taskMap: Map<string, string>
  ): Promise<string> {
    const taskId = uuidv4();
    
    // Find parent task if this is a sub-step
    let parentTaskId = null;
    if ((step as any).parentId) {
      parentTaskId = taskMap.get((step as any).parentId) || null;
    }
    
    await db.insert(workflowTasksTable).values({
      id: taskId,
      workflow_id: workflowId,
      parent_task_id: parentTaskId,
      task_type: step.type,
      title: step.title,
      description: step.description || '',
      status: 'pending',
      prerequisites: (step as any).prerequisites || [],
      validation_rules: (step as any).validation || {},
      metadata: (step as any).metadata || {},
      created_at: new Date(),
      updated_at: new Date(),
    });
    
    // Create corresponding conversation task for visibility
    await db.insert(conversationTasksTable).values({
      conversation_id: await this.getConversationId(workflowId),
      workflow_task_id: taskId,
      is_workflow_generated: true,
      title: step.title,
      description: step.description || '',
      priority: (step as any).critical ? 'high' : 'medium',
      status: 'todo',
      workflow_metadata: {
        workflowId,
        stepId: step.id,
        type: step.type
      },
      created_at: new Date(),
      updated_at: new Date(),
    });
    
    return taskId;
  }

  /**
   * Creates a dependency between workflow tasks
   */
  private async createDependency(
    taskId: string, 
    dependsOnTaskId: string,
    type: 'blocks' | 'informs' | 'optional' | 'conditional' = 'blocks'
  ): Promise<void> {
    try {
      // Build the values object based on what columns exist
      const baseValues: any = {
        task_id: taskId,
        depends_on_task_id: dependsOnTaskId,
        dependency_type: type,
        created_at: new Date(),
      };
      
      // Check if we should include condition (schema has it)
      const schemaHasCondition = !!(workflowDependenciesTable as any).condition;
      
      // Just insert without condition since it doesn't exist in DB
      await db.insert(workflowDependenciesTable).values(baseValues);
    } catch (error) {
      console.log('[WorkflowBrain] Continuing without dependency - non-critical error');
      // Continue without the dependency - workflow can still function
    }
  }

  /**
   * Records the outcome of a workflow execution
   */
  async recordOutcome(
    workflow: Workflow, 
    success: boolean, 
    feedback?: string
  ): Promise<void> {
    const endTime = new Date();
    
    // Update workflow status
    await db.update(conversationWorkflowsTable)
      .set({
        status: success ? 'completed' : 'failed',
        completed_at: endTime,
        failure_reason: !success ? feedback : null,
        updated_at: endTime
      })
      .where(eq(conversationWorkflowsTable.id, workflow.id));
    
    // Log the outcome
    await this.logExecution(
      workflow.id,
      null,
      success ? 'workflow_completed' : 'workflow_failed',
      'system',
      { feedback }
    );
    
    // Update template success rate
    if (workflow.templateId) {
      await this.updateTemplateMetrics(workflow.templateId, success);
    }
    
    // Learn from the outcome
    await this.learnFromWorkflow(workflow, success, feedback);
  }

  /**
   * Suggests optimizations for a workflow
   */
  async suggestOptimizations(workflow: Workflow): Promise<Optimization[]> {
    const optimizations: Optimization[] = [];
    
    // Analyze execution history
    const executions = await db.select()
      .from(workflowExecutionsTable)
      .where(eq(workflowExecutionsTable.workflow_id, workflow.id))
      .orderBy(workflowExecutionsTable.created_at);
    
    // Check for steps that always get skipped
    const skippedSteps = executions.filter(e => e.action === 'task_skipped');
    if (skippedSteps.length > 0) {
      optimizations.push({
        type: 'skip_step',
        description: 'Some steps are consistently skipped and could be removed',
        confidence: 0.8,
        impact: 'medium',
        suggestion: { stepsToRemove: skippedSteps.map(s => s.task_id) }
      });
    }
    
    // Check for parallel execution opportunities
    const parallelOpportunities = await this.findParallelOpportunities(workflow);
    if (parallelOpportunities.length > 0) {
      optimizations.push({
        type: 'parallel',
        description: 'Some tasks could be executed in parallel',
        confidence: 0.9,
        impact: 'high',
        suggestion: { parallelGroups: parallelOpportunities }
      });
    }
    
    // Check learning patterns
    const patterns = await this.getRelevantPatterns(workflow.templateId);
    for (const pattern of patterns) {
      if (pattern.confidence_score > 70) {
        optimizations.push({
          type: 'modify_validation',
          description: pattern.pattern_data.description,
          confidence: pattern.confidence_score / 100,
          impact: 'medium',
          suggestion: pattern.pattern_data
        });
      }
    }
    
    return optimizations;
  }

  /**
   * Learns from workflow execution
   */
  private async learnFromWorkflow(
    workflow: Workflow, 
    success: boolean, 
    feedback?: string
  ): Promise<void> {
    if (!workflow.templateId) return;
    
    // Extract patterns from the execution
    const patterns = await this.extractPatterns(workflow, success);
    
    for (const pattern of patterns) {
      // Check if pattern already exists
      const existing = await db.select()
        .from(workflowLearningTable)
        .where(
          and(
            eq(workflowLearningTable.template_id, workflow.templateId),
            eq(workflowLearningTable.pattern_type, pattern.type),
            sql`${workflowLearningTable.pattern_data}::text = ${JSON.stringify(pattern.data)}::text`
          )
        )
        .limit(1);
      
      if (existing.length > 0) {
        // Update existing pattern
        const current = existing[0];
        const newConfidence = this.updateConfidence(
          current.confidence_score,
          current.occurrence_count,
          success
        );
        
        await db.update(workflowLearningTable)
          .set({
            confidence_score: newConfidence.toString(),
            occurrence_count: current.occurrence_count + 1,
            last_observed: new Date(),
            success_count: success ? current.success_count + 1 : current.success_count,
            updated_at: new Date()
          })
          .where(eq(workflowLearningTable.id, current.id));
      } else {
        // Create new pattern
        await db.insert(workflowLearningTable).values({
          template_id: workflow.templateId,
          pattern_type: pattern.type,
          pattern_data: pattern.data,
          confidence_score: success ? '60' : '40',
          occurrence_count: 1,
          success_count: success ? 1 : 0,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
    }
  }

  /**
   * Extracts learnable patterns from workflow execution
   */
  private async extractPatterns(workflow: Workflow, success: boolean): Promise<any[]> {
    const patterns: any[] = [];
    
    // Pattern: Time of day for successful meetings
    if (workflow.context.conversationId && workflow.steps.some(s => s.id.includes('schedule'))) {
      const timePattern = {
        type: 'scheduling_preference',
        data: {
          timeOfDay: new Date().getHours(),
          dayOfWeek: new Date().getDay(),
          success
        }
      };
      patterns.push(timePattern);
    }
    
    // Pattern: Data collection efficiency
    const gatherSteps = workflow.steps.filter(s => s.type === 'gather');
    if (gatherSteps.length > 0) {
      const efficiency = {
        type: 'data_collection',
        data: {
          fieldsRequested: gatherSteps.flatMap(s => s.requiredData || []),
          success,
          attemptCount: gatherSteps.length
        }
      };
      patterns.push(efficiency);
    }
    
    return patterns;
  }

  /**
   * Updates confidence score based on new observation
   */
  private updateConfidence(
    currentScore: string | number, 
    occurrences: number, 
    success: boolean
  ): number {
    const current = typeof currentScore === 'string' ? parseFloat(currentScore) : currentScore;
    const weight = Math.min((occurrences || 0) / 10, 0.9); // More occurrences = more stable
    const successBoost = success ? 5 : -3;
    const newScore = current * weight + successBoost * (1 - weight);
    return Math.max(0, Math.min(100, newScore));
  }

  /**
   * Finds opportunities for parallel task execution
   */
  private async findParallelOpportunities(workflow: Workflow): Promise<string[][]> {
    const opportunities: string[][] = [];
    
    // Get all tasks and their dependencies
    const tasks = await db.select()
      .from(workflowTasksTable)
      .where(eq(workflowTasksTable.workflow_id, workflow.id));
    
    const dependencies = await db.select()
      .from(workflowDependenciesTable)
      .where(
        inArray(
          workflowDependenciesTable.task_id,
          tasks.map(t => t.id)
        )
      );
    
    // Build dependency graph
    const depGraph = new Map<string, Set<string>>();
    for (const dep of dependencies) {
      if (!depGraph.has(dep.task_id)) {
        depGraph.set(dep.task_id, new Set());
      }
      depGraph.get(dep.task_id)!.add(dep.depends_on_task_id);
    }
    
    // Find tasks with no shared dependencies
    const independentGroups: string[][] = [];
    for (const task1 of tasks) {
      for (const task2 of tasks) {
        if (task1.id === task2.id) continue;
        
        const deps1 = depGraph.get(task1.id) || new Set();
        const deps2 = depGraph.get(task2.id) || new Set();
        
        // If no shared dependencies and not dependent on each other
        if (!deps1.has(task2.id) && !deps2.has(task1.id)) {
          // Check if they're not already in a group
          let added = false;
          for (const group of independentGroups) {
            if (group.includes(task1.id) || group.includes(task2.id)) {
              if (!group.includes(task1.id)) group.push(task1.id);
              if (!group.includes(task2.id)) group.push(task2.id);
              added = true;
              break;
            }
          }
          if (!added) {
            independentGroups.push([task1.id, task2.id]);
          }
        }
      }
    }
    
    return independentGroups.filter(g => g.length > 1);
  }

  /**
   * Gets relevant learning patterns for a template
   */
  private async getRelevantPatterns(templateId?: string): Promise<any[]> {
    if (!templateId) return [];
    
    return await db.select()
      .from(workflowLearningTable)
      .where(
        and(
          eq(workflowLearningTable.template_id, templateId),
          gte(workflowLearningTable.confidence_score, '70')
        )
      )
      .orderBy(desc(workflowLearningTable.confidence_score))
      .limit(5);
  }

  /**
   * Gets template for a category
   */
  private async getTemplateForCategory(
    category: string, 
    capabilities?: string[]
  ): Promise<WorkflowTemplate | null> {
    try {
      const query = db.select()
        .from(workflowTemplatesTable)
        .where(
          and(
            eq(workflowTemplatesTable.category, category),
            eq(workflowTemplatesTable.is_active, true)
          )
        )
        .orderBy(desc(workflowTemplatesTable.success_rate))
        .limit(1);
      
      const results = await query;
      
      if (results.length === 0) {
        console.log('[WorkflowBrain] No template found for category:', category);
        
        // Return a default scheduling template if none exists in DB
        if (category === 'scheduling') {
          return this.getDefaultSchedulingTemplate();
        }
        
        return null;
      }
      
      const template = results[0];
      
      // Check if capabilities match
      if (template.required_capabilities && capabilities) {
        const hasAllCapabilities = template.required_capabilities.every(
          cap => capabilities.includes(cap)
        );
        if (!hasAllCapabilities) {
          // If capabilities don't match but it's scheduling, use default
          if (category === 'scheduling') {
            return this.getDefaultSchedulingTemplate();
          }
          return null;
        }
      }
      
      console.log('[WorkflowBrain] Template fetched:', {
        id: template.id,
        name: template.name,
        category: template.category,
        base_structure_type: typeof template.base_structure,
        has_steps: template.base_structure?.steps ? 'yes' : 'no'
      });
      
      // Validate the template structure
      let isValid = false;
      if (template.base_structure) {
        if (typeof template.base_structure === 'object' && (template.base_structure as any).steps) {
          isValid = true;
        } else if (typeof template.base_structure === 'string') {
          try {
            const parsed = JSON.parse(template.base_structure);
            isValid = parsed.steps && Array.isArray(parsed.steps);
          } catch (e) {
            isValid = false;
          }
        }
      }
      
      // If invalid template but it's scheduling, use default
      if (!isValid && category === 'scheduling') {
        console.log('[WorkflowBrain] Template structure invalid, using default');
        return this.getDefaultSchedulingTemplate();
      }
      
      return {
        id: template.id,
        name: template.name,
        category: template.category,
        baseStructure: template.base_structure,
        requiredCapabilities: template.required_capabilities || undefined
      };
    } catch (error) {
      console.error('[WorkflowBrain] Error fetching template:', error);
      
      // Return default for scheduling on any error
      if (category === 'scheduling') {
        return this.getDefaultSchedulingTemplate();
      }
      
      return null;
    }
  }

  /**
   * ML-based workflow detection (placeholder for future enhancement)
   */
  private async mlWorkflowDetection(
    message: string, 
    context?: Partial<WorkflowContext>
  ): Promise<WorkflowTemplate | null> {
    // This would integrate with an ML model for more sophisticated detection
    // For now, return null
    return null;
  }

  /**
   * Returns a default scheduling template when DB is empty
   */
  private getDefaultSchedulingTemplate(): WorkflowTemplate {
    return {
      id: 'default-scheduling',
      name: 'Schedule Meeting',
      category: 'scheduling',
      baseStructure: {
        steps: [
          {
            id: 'gather_attendees',
            type: 'gather' as const,
            title: 'Gather attendee information',
            description: 'Collect email addresses of meeting participants',
            requiredData: ['attendees'],
            critical: true
          },
          {
            id: 'gather_datetime',
            type: 'gather' as const,
            title: 'Determine meeting time',
            description: 'Specify when the meeting should occur',
            requiredData: ['startTime', 'endTime'],
            critical: true
          },
          {
            id: 'check_availability',
            type: 'execute' as const,
            title: 'Check calendar availability',
            description: 'Verify the time slot is available',
            dependsOn: ['gather_datetime'],
            critical: true
          },
          {
            id: 'confirm_details',
            type: 'confirm' as const,
            title: 'Confirm meeting details',
            description: 'Review all details before booking',
            dependsOn: ['gather_attendees', 'gather_datetime'],
            critical: true
          },
          {
            id: 'book_meeting',
            type: 'execute' as const,
            title: 'Book the meeting',
            description: 'Create calendar event and send invites',
            dependsOn: ['confirm_details', 'check_availability'],
            critical: true,
            retryOnFailure: true
          }
        ]
      },
      requiredCapabilities: ['calendar']
    };
  }

  /**
   * Updates template metrics after execution
   */
  private async updateTemplateMetrics(templateId: string, success: boolean): Promise<void> {
    const template = await db.select()
      .from(workflowTemplatesTable)
      .where(eq(workflowTemplatesTable.id, templateId))
      .limit(1);
    
    if (template.length === 0) return;
    
    const current = template[0];
    const currentRate = parseFloat(current.success_rate || '0');
    const executions = await db.select()
      .from(conversationWorkflowsTable)
      .where(eq(conversationWorkflowsTable.template_id, templateId));
    
    const totalExecutions = executions.length;
    const newRate = ((currentRate * (totalExecutions - 1)) + (success ? 100 : 0)) / totalExecutions;
    
    await db.update(workflowTemplatesTable)
      .set({
        success_rate: newRate.toFixed(2),
        updated_at: new Date()
      })
      .where(eq(workflowTemplatesTable.id, templateId));
  }

  /**
   * Logs workflow execution events
   */
  private async logExecution(
    workflowId: string,
    taskId: string | null,
    action: string,
    actor: string,
    data: any = {}
  ): Promise<void> {
    await db.insert(workflowExecutionsTable).values({
      workflow_id: workflowId,
      task_id: taskId,
      action,
      actor,
      input_data: data,
      created_at: new Date()
    });
  }

  /**
   * Gets conversation ID from workflow ID
   */
  private async getConversationId(workflowId: string): Promise<string> {
    const workflow = await db.select()
      .from(conversationWorkflowsTable)
      .where(eq(conversationWorkflowsTable.id, workflowId))
      .limit(1);
    
    return workflow[0]?.conversation_id || '';
  }

  /**
   * Gets the next task to execute in a workflow
   */
  async getNextTask(workflowId: string): Promise<any | null> {
    try {
      const tasks = await db.select()
        .from(workflowTasksTable)
        .where(
          and(
            eq(workflowTasksTable.workflow_id, workflowId),
            eq(workflowTasksTable.status, 'pending')
          )
        )
        .orderBy(workflowTasksTable.created_at);
      
      // Ensure tasks is an array
      const taskArray = Array.isArray(tasks) ? tasks : [];
      
      for (const task of taskArray) {
        // Check if all dependencies are completed
        let deps = [];
        try {
          deps = await db.select()
            .from(workflowDependenciesTable)
            .where(eq(workflowDependenciesTable.task_id, task.id));
        } catch (error) {
          console.log('[WorkflowBrain] Error fetching dependencies, assuming none');
          deps = [];
        }
        
        let canExecute = true;
        for (const dep of deps) {
          if (dep.dependency_type === 'blocks') {
            const depTask = await db.select()
              .from(workflowTasksTable)
              .where(eq(workflowTasksTable.id, dep.depends_on_task_id))
              .limit(1);
            
            if (depTask[0]?.status !== 'completed') {
              canExecute = false;
              break;
            }
          }
        }
        
        if (canExecute) {
          return task;
        }
      }
    } catch (error) {
      console.error('[WorkflowBrain] Error in getNextTask:', error);
    }
    
    return null;
  }

  /**
   * Marks a task as completed and progresses the workflow
   */
  async completeTask(taskId: string, data?: any): Promise<void> {
    const task = await db.select()
      .from(workflowTasksTable)
      .where(eq(workflowTasksTable.id, taskId))
      .limit(1);
    
    if (task.length === 0) return;
    
    const completedAt = new Date();
    const duration = task[0].started_at 
      ? completedAt.getTime() - new Date(task[0].started_at).getTime()
      : null;
    
    // Update task status
    await db.update(workflowTasksTable)
      .set({
        status: 'completed',
        completed_at: completedAt,
        actual_duration: duration ? `${duration} milliseconds` : null,
        data_collected: data || {},
        updated_at: completedAt
      })
      .where(eq(workflowTasksTable.id, taskId));
    
    // Update conversation task
    await db.update(conversationTasksTable)
      .set({
        status: 'completed',
        updated_at: completedAt
      })
      .where(eq(conversationTasksTable.workflow_task_id, taskId));
    
    // Log completion
    await this.logExecution(
      task[0].workflow_id,
      taskId,
      'task_completed',
      'system',
      { data, duration }
    );
  }
}