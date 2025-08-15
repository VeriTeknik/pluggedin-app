// Manual test script for workflow system
// Run with: npx tsx test-workflow-manual.ts

import { WorkflowBrain } from './lib/workflows/workflow-brain';
import { InformationOrchestrator } from './lib/workflows/info-orchestrator';

async function testWorkflowSystem() {
  console.log('=== Testing Workflow System ===\n');

  // Test 1: Workflow Detection
  console.log('1. Testing workflow detection...');
  const brain = new WorkflowBrain();
  
  const testMessages = [
    'Schedule a meeting with the team next week',
    'I need to book a calendar slot',
    'Can you help me create a support ticket?',
    'Add John Doe as a new lead',
    'What is the weather today?'
  ];

  for (const message of testMessages) {
    const template = await brain.detectWorkflowNeed(message);
    console.log(`  Message: "${message}"`);
    console.log(`  Detected: ${template ? template.name : 'No workflow needed'}\n`);
  }

  // Test 2: Information Orchestration
  console.log('2. Testing information orchestration...');
  const orchestrator = new InformationOrchestrator();
  
  const mockWorkflow = {
    id: 'test-workflow',
    template_id: 'meeting_scheduler',
    conversation_id: 'test-conv',
    context: {
      existingData: {
        title: 'Team Sync Meeting'
      }
    }
  };

  const missingInfo = await orchestrator.identifyMissingInfo(mockWorkflow, 'collect_attendees');
  console.log('  Missing information for meeting:');
  missingInfo.forEach(info => {
    console.log(`    - ${info.field}: ${info.description}`);
  });

  // Test 3: Natural Language Prompts
  console.log('\n3. Testing prompt generation...');
  for (const info of missingInfo.slice(0, 2)) {
    const prompt = await orchestrator.generatePrompt(info, {
      purpose: 'Schedule Meeting',
      action: 'booking a team sync'
    });
    console.log(`  Field: ${info.field}`);
    console.log(`  Prompt: "${prompt.message}"\n`);
  }

  // Test 4: Workflow Generation
  console.log('4. Testing workflow generation...');
  const schedulingTemplate = await brain.detectWorkflowNeed('Schedule a meeting with Sarah tomorrow at 2pm');
  
  if (schedulingTemplate) {
    const context = {
      conversationId: 'test-conv-123',
      userId: 'test-user',
      existingData: {
        title: 'Meeting with Sarah',
        requestedTime: 'tomorrow at 2pm'
      },
      memories: [],
      capabilities: ['schedule_meeting', 'send_email'],
      timezone: 'America/New_York',
      language: 'en'
    };

    console.log('  Generating workflow with context:');
    console.log(`    - Title: ${context.existingData.title}`);
    console.log(`    - Requested time: ${context.existingData.requestedTime}`);
    console.log(`    - Capabilities: ${context.capabilities.join(', ')}`);
    
    try {
      const workflow = await brain.generateWorkflow(schedulingTemplate, context);
      console.log(`\n  Generated workflow:`);
      console.log(`    - ID: ${workflow.id}`);
      console.log(`    - Template: ${workflow.template_id}`);
      console.log(`    - Status: ${workflow.status}`);
      console.log(`    - Steps: ${workflow.steps.length}`);
      
      workflow.steps.forEach((step, index) => {
        console.log(`      ${index + 1}. ${step.title} (${step.status})`);
      });
    } catch (error) {
      console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n=== Workflow System Test Complete ===');
}

// Run the test
testWorkflowSystem().catch(console.error);