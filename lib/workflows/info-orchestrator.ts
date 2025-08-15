/**
 * Information Orchestrator - Intelligent information gathering and validation
 * 
 * This module handles the intelligent collection of information required by workflows,
 * generates natural conversation prompts, validates collected data, and handles partial information.
 */

import { db } from '@/db';
import { 
  workflowTasksTable,
  conversationMemoriesTable,
  chatConversationsTable,
  users
} from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// Types
export interface InfoRequirement {
  field: string;
  type: 'text' | 'email' | 'phone' | 'date' | 'time' | 'number' | 'boolean' | 'select' | 'multiselect';
  required: boolean;
  validation?: ValidationRule;
  currentValue?: any;
  source?: 'user' | 'memory' | 'profile' | 'api' | 'inference';
  confidence?: number;
  options?: string[]; // For select/multiselect types
  constraints?: any; // Additional constraints like min/max for numbers, date ranges, etc.
}

export interface ValidationRule {
  type: 'regex' | 'function' | 'schema' | 'custom';
  pattern?: string | RegExp;
  validator?: (value: any) => boolean;
  schema?: any; // For complex validation schemas
  message?: string; // Custom error message
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
  normalizedValue?: any;
}

export interface ConversationPrompt {
  message: string;
  followUp?: string;
  examples?: string[];
  clarification?: string;
  tone: 'friendly' | 'professional' | 'casual' | 'urgent';
}

export interface PartialDataStrategy {
  strategy: 'wait' | 'proceed' | 'default' | 'infer' | 'ask';
  defaults?: Record<string, any>;
  inferenceRules?: Record<string, any>;
  criticalFields?: string[];
}

// Common validation patterns
const VALIDATION_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[\d\s\-\(\)]+$/,
  url: /^https?:\/\/.+/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}(:\d{2})?$/,
  businessEmail: /^[^\s@]+@(?!gmail|yahoo|hotmail|outlook)[^\s@]+\.[^\s@]+$/,
};

// Field-specific prompt templates
const PROMPT_TEMPLATES = {
  email: {
    initial: "What email address should I use for {purpose}?",
    followUp: "Please provide a valid email address (e.g., name@example.com)",
    clarification: "I need an email address to {action}. Can you provide one?"
  },
  attendees: {
    initial: "Who should attend this {eventType}?",
    followUp: "Please provide the email addresses of the attendees, separated by commas.",
    clarification: "I can add multiple attendees. Just list their email addresses."
  },
  dateTime: {
    initial: "When would you like to {action}?",
    followUp: "Please specify a date and time (e.g., 'tomorrow at 2pm' or 'Friday, March 15 at 10:30am')",
    clarification: "I need both the date and time for scheduling."
  },
  title: {
    initial: "What should we call this {itemType}?",
    followUp: "Please provide a brief, descriptive title.",
    clarification: "A short title will help identify this {itemType} later."
  },
  description: {
    initial: "How would you describe {subject}?",
    followUp: "Please provide more details about {subject}.",
    clarification: "Additional context will help me {action} more effectively."
  },
  priority: {
    initial: "How urgent is this {itemType}?",
    followUp: "Please choose a priority level: Low, Medium, High, or Urgent",
    clarification: "This helps me understand how quickly to handle your request."
  },
  confirmation: {
    initial: "I have the following details:\n{details}\n\nShall I proceed?",
    followUp: "Please confirm with 'yes' to proceed or 'no' to make changes.",
    clarification: "I want to make sure everything is correct before {action}."
  }
};

export class InformationOrchestrator {
  private conversationContext: Map<string, any> = new Map();
  
  /**
   * Identifies missing information for a workflow
   */
  async identifyMissingInfo(
    workflow: any,
    taskId: string
  ): Promise<InfoRequirement[]> {
    const missingInfo: InfoRequirement[] = [];
    
    // Get the task details
    const task = await db.select()
      .from(workflowTasksTable)
      .where(eq(workflowTasksTable.id, taskId))
      .limit(1);
    
    if (task.length === 0) return [];
    
    const taskData = task[0];
    const requiredFields = taskData.prerequisites || [];
    const collectedData = taskData.data_collected || {};
    
    // Check each required field
    for (const field of requiredFields) {
      const fieldInfo = this.parseFieldRequirement(field);
      
      // Check if data is already collected
      if (collectedData[fieldInfo.field]) {
        fieldInfo.currentValue = collectedData[fieldInfo.field];
        fieldInfo.source = 'user';
        continue;
      }
      
      // Try to find data from other sources
      const foundData = await this.searchForData(
        fieldInfo.field,
        workflow.conversationId,
        workflow.context?.userId
      );
      
      if (foundData.value) {
        fieldInfo.currentValue = foundData.value;
        fieldInfo.source = foundData.source;
        fieldInfo.confidence = foundData.confidence;
        
        // Only mark as missing if confidence is low
        if (foundData.confidence < 0.7) {
          missingInfo.push(fieldInfo);
        }
      } else {
        missingInfo.push(fieldInfo);
      }
    }
    
    return missingInfo;
  }

  /**
   * Generates natural conversation prompts for missing information
   */
  async generatePrompt(
    requirement: InfoRequirement,
    context?: any
  ): Promise<ConversationPrompt> {
    const fieldType = requirement.field.toLowerCase();
    const template = PROMPT_TEMPLATES[fieldType] || PROMPT_TEMPLATES['description'];
    
    // Determine tone based on context
    const tone = this.determineTone(context);
    
    // Generate base message
    let message = template.initial;
    
    // Replace placeholders
    message = this.replacePlaceholders(message, {
      purpose: context?.purpose || 'this request',
      action: context?.action || 'proceed',
      eventType: context?.eventType || 'meeting',
      itemType: context?.itemType || 'item',
      subject: context?.subject || 'this',
      details: context?.details || ''
    });
    
    // Add examples if available
    const examples = this.getFieldExamples(requirement);
    
    // Build the prompt
    const prompt: ConversationPrompt = {
      message,
      followUp: template.followUp ? this.replacePlaceholders(template.followUp, context) : undefined,
      examples: examples.length > 0 ? examples : undefined,
      clarification: template.clarification ? this.replacePlaceholders(template.clarification, context) : undefined,
      tone
    };
    
    // Add conversational elements based on tone
    if (tone === 'friendly') {
      prompt.message = this.addFriendlyTone(prompt.message);
    } else if (tone === 'urgent') {
      prompt.message = this.addUrgentTone(prompt.message);
    }
    
    return prompt;
  }

  /**
   * Validates collected information
   */
  async validateInfo(
    data: any,
    requirement: InfoRequirement
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
    
    // Type validation
    if (!this.validateType(data, requirement.type)) {
      result.valid = false;
      result.errors?.push(`Expected ${requirement.type} but got ${typeof data}`);
      return result;
    }
    
    // Required field validation
    if (requirement.required && !data) {
      result.valid = false;
      result.errors?.push(`${requirement.field} is required`);
      return result;
    }
    
    // Custom validation rules
    if (requirement.validation) {
      const validationResult = await this.applyValidation(data, requirement.validation);
      if (!validationResult.valid) {
        result.valid = false;
        result.errors?.push(...(validationResult.errors || []));
      }
      result.warnings?.push(...(validationResult.warnings || []));
      result.suggestions?.push(...(validationResult.suggestions || []));
    }
    
    // Field-specific validation
    const fieldValidation = await this.validateField(data, requirement);
    if (!fieldValidation.valid) {
      result.valid = false;
      result.errors?.push(...(fieldValidation.errors || []));
    }
    
    // Normalize the value
    result.normalizedValue = this.normalizeValue(data, requirement.type);
    
    // Add intelligent suggestions
    const suggestions = await this.generateSuggestions(data, requirement);
    result.suggestions?.push(...suggestions);
    
    return result;
  }

  /**
   * Handles partial information gracefully
   */
  async handlePartialInfo(
    workflow: any,
    available: Record<string, any>
  ): Promise<any> {
    const strategy = await this.determineStrategy(workflow, available);
    
    switch (strategy.strategy) {
      case 'wait':
        // Wait for all required information
        return {
          ...workflow,
          status: 'blocked',
          waitingFor: strategy.criticalFields
        };
      
      case 'proceed':
        // Proceed with available information
        return {
          ...workflow,
          status: 'active',
          partialData: true,
          availableData: available
        };
      
      case 'default':
        // Use default values for missing fields
        const withDefaults = { ...available, ...strategy.defaults };
        return {
          ...workflow,
          status: 'active',
          data: withDefaults,
          usedDefaults: true
        };
      
      case 'infer':
        // Infer missing values
        const inferred = await this.inferMissingData(workflow, available, strategy.inferenceRules);
        return {
          ...workflow,
          status: 'active',
          data: { ...available, ...inferred },
          inferredData: Object.keys(inferred)
        };
      
      case 'ask':
        // Ask for critical fields only
        return {
          ...workflow,
          status: 'gathering',
          requiredFields: strategy.criticalFields,
          availableData: available
        };
      
      default:
        return workflow;
    }
  }

  /**
   * Searches for data from various sources
   */
  private async searchForData(
    field: string,
    conversationId: string,
    userId?: string
  ): Promise<{ value: any; source: string; confidence: number }> {
    // Check conversation memory first
    const memories = await db.select()
      .from(conversationMemoriesTable)
      .where(eq(conversationMemoriesTable.conversation_id, conversationId))
      .orderBy(desc(conversationMemoriesTable.created_at))
      .limit(10);
    
    for (const memory of memories) {
      const content = memory.content as any;
      if (content[field]) {
        return {
          value: content[field],
          source: 'memory',
          confidence: 0.9
        };
      }
    }
    
    // Check user profile if userId is available
    if (userId) {
      const user = await db.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (user.length > 0) {
        const userData = user[0];
        const fieldMap: Record<string, string> = {
          email: 'email',
          name: 'name',
          phone: 'phone',
          timezone: 'timezone'
        };
        
        const userField = fieldMap[field];
        if (userField && userData[userField]) {
          return {
            value: userData[userField],
            source: 'profile',
            confidence: 1.0
          };
        }
      }
    }
    
    // Try to infer from context
    const inferredValue = await this.inferFromContext(field, conversationId);
    if (inferredValue) {
      return {
        value: inferredValue,
        source: 'inference',
        confidence: 0.5
      };
    }
    
    return { value: null, source: 'none', confidence: 0 };
  }

  /**
   * Parses field requirement from configuration
   */
  private parseFieldRequirement(field: any): InfoRequirement {
    if (typeof field === 'string') {
      return {
        field,
        type: this.inferFieldType(field),
        required: true
      };
    }
    
    return {
      field: field.name || field.field,
      type: field.type || this.inferFieldType(field.name || field.field),
      required: field.required !== false,
      validation: field.validation,
      options: field.options,
      constraints: field.constraints
    };
  }

  /**
   * Infers field type from field name
   */
  private inferFieldType(fieldName: string): InfoRequirement['type'] {
    const lowerField = fieldName.toLowerCase();
    
    if (lowerField.includes('email')) return 'email';
    if (lowerField.includes('phone') || lowerField.includes('tel')) return 'phone';
    if (lowerField.includes('date')) return 'date';
    if (lowerField.includes('time')) return 'time';
    if (lowerField.includes('number') || lowerField.includes('count') || lowerField.includes('amount')) return 'number';
    if (lowerField.includes('is_') || lowerField.includes('has_') || lowerField.includes('should_')) return 'boolean';
    
    return 'text';
  }

  /**
   * Determines the appropriate tone for prompts
   */
  private determineTone(context?: any): ConversationPrompt['tone'] {
    if (context?.urgent || context?.priority === 'urgent') return 'urgent';
    if (context?.formal || context?.businessContext) return 'professional';
    if (context?.casual || context?.friendlyMode) return 'casual';
    return 'friendly';
  }

  /**
   * Replaces placeholders in template strings
   */
  private replacePlaceholders(template: string, values: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(values)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * Gets examples for a field type
   */
  private getFieldExamples(requirement: InfoRequirement): string[] {
    const examples: Record<string, string[]> = {
      email: ['john.doe@example.com', 'team@company.org'],
      phone: ['+1 (555) 123-4567', '555-0123'],
      date: ['2024-03-15', 'tomorrow', 'next Monday'],
      time: ['14:30', '2:30 PM', '3pm'],
      priority: ['Low', 'Medium', 'High', 'Urgent']
    };
    
    return examples[requirement.type] || [];
  }

  /**
   * Adds friendly tone to message
   */
  private addFriendlyTone(message: string): string {
    const prefixes = [
      "I'd be happy to help! ",
      "Great! ",
      "Perfect! ",
      "Sounds good! "
    ];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    return prefix + message;
  }

  /**
   * Adds urgent tone to message
   */
  private addUrgentTone(message: string): string {
    return "⚠️ " + message + " (This is time-sensitive)";
  }

  /**
   * Validates data type
   */
  private validateType(data: any, type: InfoRequirement['type']): boolean {
    switch (type) {
      case 'text':
        return typeof data === 'string';
      case 'number':
        return typeof data === 'number' || !isNaN(Number(data));
      case 'boolean':
        return typeof data === 'boolean' || data === 'true' || data === 'false';
      case 'email':
      case 'phone':
      case 'date':
      case 'time':
        return typeof data === 'string';
      case 'select':
        return typeof data === 'string';
      case 'multiselect':
        return Array.isArray(data);
      default:
        return true;
    }
  }

  /**
   * Applies custom validation rules
   */
  private async applyValidation(
    data: any,
    validation: ValidationRule
  ): Promise<ValidationResult> {
    const result: ValidationResult = { valid: true };
    
    switch (validation.type) {
      case 'regex':
        const pattern = validation.pattern instanceof RegExp 
          ? validation.pattern 
          : new RegExp(validation.pattern as string);
        if (!pattern.test(data)) {
          result.valid = false;
          result.errors = [validation.message || 'Value does not match expected pattern'];
        }
        break;
      
      case 'function':
        if (validation.validator && !validation.validator(data)) {
          result.valid = false;
          result.errors = [validation.message || 'Validation failed'];
        }
        break;
      
      case 'schema':
        // Implement schema validation (e.g., using Zod or Joi)
        break;
      
      case 'custom':
        // Custom validation logic
        break;
    }
    
    return result;
  }

  /**
   * Performs field-specific validation
   */
  private async validateField(
    data: any,
    requirement: InfoRequirement
  ): Promise<ValidationResult> {
    const result: ValidationResult = { valid: true };
    
    switch (requirement.type) {
      case 'email':
        if (!VALIDATION_PATTERNS.email.test(data)) {
          result.valid = false;
          result.errors = ['Invalid email address format'];
        }
        // Check for business email if required
        if (requirement.constraints?.businessOnly && !VALIDATION_PATTERNS.businessEmail.test(data)) {
          result.warnings = ['Personal email addresses may not be suitable for business communications'];
        }
        break;
      
      case 'phone':
        if (!VALIDATION_PATTERNS.phone.test(data)) {
          result.valid = false;
          result.errors = ['Invalid phone number format'];
        }
        break;
      
      case 'date':
        const date = new Date(data);
        if (isNaN(date.getTime())) {
          result.valid = false;
          result.errors = ['Invalid date format'];
        }
        // Check date constraints
        if (requirement.constraints?.futureOnly && date < new Date()) {
          result.valid = false;
          result.errors = ['Date must be in the future'];
        }
        if (requirement.constraints?.businessDays && (date.getDay() === 0 || date.getDay() === 6)) {
          result.warnings = ['Selected date is not a business day'];
        }
        break;
      
      case 'time':
        if (!VALIDATION_PATTERNS.time.test(data)) {
          result.valid = false;
          result.errors = ['Invalid time format'];
        }
        // Check business hours
        if (requirement.constraints?.businessHours) {
          const [hours] = data.split(':').map(Number);
          if (hours < 9 || hours >= 18) {
            result.warnings = ['Selected time is outside business hours (9 AM - 6 PM)'];
          }
        }
        break;
      
      case 'select':
        if (requirement.options && !requirement.options.includes(data)) {
          result.valid = false;
          result.errors = [`Value must be one of: ${requirement.options.join(', ')}`];
        }
        break;
      
      case 'multiselect':
        if (requirement.options) {
          const invalidOptions = data.filter((item: string) => !requirement.options?.includes(item));
          if (invalidOptions.length > 0) {
            result.valid = false;
            result.errors = [`Invalid options: ${invalidOptions.join(', ')}`];
          }
        }
        break;
    }
    
    return result;
  }

  /**
   * Normalizes value based on type
   */
  private normalizeValue(data: any, type: InfoRequirement['type']): any {
    switch (type) {
      case 'email':
        return data.toLowerCase().trim();
      
      case 'phone':
        // Remove non-numeric characters except + for international
        return data.replace(/[^\d+]/g, '');
      
      case 'date':
        // Ensure ISO format
        return new Date(data).toISOString().split('T')[0];
      
      case 'time':
        // Ensure HH:MM format
        const timeParts = data.match(/(\d{1,2}):?(\d{2})/);
        if (timeParts) {
          const hours = timeParts[1].padStart(2, '0');
          const minutes = timeParts[2];
          return `${hours}:${minutes}`;
        }
        return data;
      
      case 'boolean':
        return data === true || data === 'true';
      
      case 'number':
        return Number(data);
      
      default:
        return data;
    }
  }

  /**
   * Generates intelligent suggestions
   */
  private async generateSuggestions(
    data: any,
    requirement: InfoRequirement
  ): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Email suggestions
    if (requirement.type === 'email' && data) {
      const domain = data.split('@')[1];
      if (domain) {
        // Check for common typos
        const commonDomains = ['gmail.com', 'outlook.com', 'yahoo.com'];
        const similarDomain = commonDomains.find(d => 
          this.levenshteinDistance(domain, d) <= 2
        );
        if (similarDomain && similarDomain !== domain) {
          suggestions.push(`Did you mean ${data.split('@')[0]}@${similarDomain}?`);
        }
      }
    }
    
    // Date suggestions
    if (requirement.type === 'date') {
      const date = new Date(data);
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
      suggestions.push(`This is a ${dayOfWeek}`);
      
      // Check for holidays or special dates
      if (this.isHoliday(date)) {
        suggestions.push('Note: This date is a holiday');
      }
    }
    
    return suggestions;
  }

  /**
   * Determines strategy for handling partial data
   */
  private async determineStrategy(
    workflow: any,
    available: Record<string, any>
  ): Promise<PartialDataStrategy> {
    // Analyze workflow requirements
    const criticalFields: string[] = [];
    const defaults: Record<string, any> = {};
    
    // Get workflow template info
    const template = workflow.template || {};
    const steps = template.steps || [];
    
    // Identify critical fields
    for (const step of steps) {
      if (step.critical && step.requiredData) {
        criticalFields.push(...step.requiredData);
      }
    }
    
    // Check if we have all critical fields
    const hasCritical = criticalFields.every(field => available[field]);
    
    if (!hasCritical) {
      // Missing critical data - must wait or ask
      const missingCritical = criticalFields.filter(field => !available[field]);
      return {
        strategy: missingCritical.length <= 2 ? 'ask' : 'wait',
        criticalFields: missingCritical
      };
    }
    
    // Have critical data - can proceed with defaults
    return {
      strategy: 'default',
      defaults: {
        priority: 'medium',
        includeGoogleMeet: true,
        sendNotifications: true,
        timezone: 'UTC'
      }
    };
  }

  /**
   * Infers missing data based on rules
   */
  private async inferMissingData(
    workflow: any,
    available: Record<string, any>,
    rules?: Record<string, any>
  ): Promise<Record<string, any>> {
    const inferred: Record<string, any> = {};
    
    // Time inference
    if (!available.endTime && available.startTime && available.duration) {
      const start = new Date(available.startTime);
      const durationMs = available.duration * 60 * 1000;
      inferred.endTime = new Date(start.getTime() + durationMs).toISOString();
    }
    
    // Location inference
    if (!available.location && available.includeGoogleMeet) {
      inferred.location = 'Google Meet (link will be provided)';
    }
    
    // Title inference
    if (!available.title && available.attendees && available.purpose) {
      const attendeeCount = Array.isArray(available.attendees) ? available.attendees.length : 1;
      inferred.title = `${available.purpose} with ${attendeeCount} attendee(s)`;
    }
    
    // Apply custom inference rules
    if (rules) {
      for (const [field, rule] of Object.entries(rules)) {
        if (!available[field] && typeof rule === 'function') {
          inferred[field] = rule(available);
        }
      }
    }
    
    return inferred;
  }

  /**
   * Infers value from conversation context
   */
  private async inferFromContext(
    field: string,
    conversationId: string
  ): Promise<any> {
    // Get recent conversation context
    const conversation = await db.select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.uuid, conversationId))
      .limit(1);
    
    if (conversation.length === 0) return null;
    
    const context = conversation[0].metadata as any || {};
    
    // Field-specific inference
    switch (field) {
      case 'timezone':
        // Infer from user's last known timezone
        return context.timezone || 'UTC';
      
      case 'language':
        // Infer from conversation language
        return context.language || 'en';
      
      case 'priority':
        // Infer from conversation sentiment or keywords
        return context.urgent ? 'high' : 'medium';
      
      default:
        return null;
    }
  }

  /**
   * Calculates Levenshtein distance for typo detection
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }

  /**
   * Checks if a date is a holiday
   */
  private isHoliday(date: Date): boolean {
    // Simple holiday check - would be expanded with actual holiday data
    const holidays = [
      '01-01', // New Year's Day
      '07-04', // Independence Day (US)
      '12-25', // Christmas
    ];
    
    const monthDay = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    return holidays.includes(monthDay);
  }

  /**
   * Builds a natural conversation flow
   */
  async buildConversationFlow(
    requirements: InfoRequirement[]
  ): Promise<ConversationPrompt[]> {
    const prompts: ConversationPrompt[] = [];
    
    // Group related fields
    const groups = this.groupRelatedFields(requirements);
    
    for (const group of groups) {
      if (group.length === 1) {
        // Single field prompt
        const prompt = await this.generatePrompt(group[0]);
        prompts.push(prompt);
      } else {
        // Combined prompt for related fields
        const combinedPrompt = await this.generateCombinedPrompt(group);
        prompts.push(combinedPrompt);
      }
    }
    
    return prompts;
  }

  /**
   * Groups related fields for combined prompting
   */
  private groupRelatedFields(requirements: InfoRequirement[]): InfoRequirement[][] {
    const groups: InfoRequirement[][] = [];
    const used = new Set<string>();
    
    // Group date and time fields
    for (const req of requirements) {
      if (used.has(req.field)) continue;
      
      if (req.type === 'date') {
        const timeField = requirements.find(r => 
          r.type === 'time' && 
          !used.has(r.field) &&
          r.field.toLowerCase().includes(req.field.toLowerCase().replace('date', ''))
        );
        
        if (timeField) {
          groups.push([req, timeField]);
          used.add(req.field);
          used.add(timeField.field);
        } else {
          groups.push([req]);
          used.add(req.field);
        }
      } else if (!used.has(req.field)) {
        groups.push([req]);
        used.add(req.field);
      }
    }
    
    return groups;
  }

  /**
   * Generates combined prompt for related fields
   */
  private async generateCombinedPrompt(
    fields: InfoRequirement[]
  ): Promise<ConversationPrompt> {
    const fieldNames = fields.map(f => f.field).join(' and ');
    const types = [...new Set(fields.map(f => f.type))].join('/');
    
    return {
      message: `Please provide the ${fieldNames}`,
      followUp: `I need ${fields.length} pieces of information: ${fieldNames}`,
      examples: fields.flatMap(f => this.getFieldExamples(f)),
      tone: 'friendly'
    };
  }
}