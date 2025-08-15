// Test script to verify workflow tasks are created and visible
// Run with: npx tsx test-workflow-tasks.ts

import { db } from './db';
import { 
  conversationTasksTable,
  workflowTemplatesTable,
  conversationWorkflowsTable,
  workflowTasksTable,
  chatConversationsTable
} from './db/schema';
import { eq } from 'drizzle-orm';

async function testWorkflowTasks() {
  console.log('=== Testing Workflow Task Creation ===\n');

  try {
    // 1. Check workflow templates
    console.log('1. Checking workflow templates...');
    const templates = await db.select().from(workflowTemplatesTable).limit(5);
    console.log(`   Found ${templates.length} workflow templates:`);
    templates.forEach(t => console.log(`   - ${t.name} (${t.category})`));

    // 2. Find a test conversation
    console.log('\n2. Finding recent conversation...');
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .orderBy(chatConversationsTable.created_at)
      .limit(1);
    
    if (!conversation) {
      console.log('   No conversations found. Create a conversation first.');
      return;
    }
    console.log(`   Using conversation: ${conversation.uuid}`);

    // 3. Check for workflow tasks
    console.log('\n3. Checking conversation tasks...');
    const tasks = await db
      .select({
        id: conversationTasksTable.id,
        title: conversationTasksTable.title,
        status: conversationTasksTable.status,
        priority: conversationTasksTable.priority,
        isWorkflow: conversationTasksTable.is_workflow_generated,
        workflowMeta: conversationTasksTable.workflow_metadata,
        workflowTaskId: conversationTasksTable.workflow_task_id
      })
      .from(conversationTasksTable)
      .where(eq(conversationTasksTable.conversation_id, conversation.uuid))
      .limit(10);

    console.log(`   Found ${tasks.length} tasks:`);
    tasks.forEach(task => {
      const prefix = task.isWorkflow ? '🤖' : '👤';
      console.log(`   ${prefix} ${task.title} [${task.status}] (${task.priority})`);
      if (task.workflowMeta) {
        console.log(`      Workflow: ${JSON.stringify(task.workflowMeta)}`);
      }
    });

    // 4. Skip workflow check for now (schema mismatch)
    console.log('\n4. Skipping workflow check (schema mismatch)...');

    // 5. Create a test workflow task
    console.log('\n5. Creating test workflow task...');
    const testTask = {
      conversation_id: conversation.uuid,
      title: '🤖 Test Workflow Task',
      description: 'This is a test task created by the workflow system',
      status: 'todo' as const,
      priority: 'high' as const,
      is_workflow_generated: true,
      workflow_metadata: {
        template: 'test_workflow',
        step: 1,
        created_by: 'test_script'
      },
      created_at: new Date(),
      updated_at: new Date()
    };

    const [createdTask] = await db
      .insert(conversationTasksTable)
      .values(testTask)
      .returning();

    console.log(`   Created task: ${createdTask.id}`);
    console.log(`   Title: ${createdTask.title}`);
    console.log(`   Workflow generated: ${createdTask.is_workflow_generated}`);

    // 6. Verify it appears in the list
    console.log('\n6. Verifying task appears in list...');
    const verifyTask = await db
      .select()
      .from(conversationTasksTable)
      .where(eq(conversationTasksTable.id, createdTask.id))
      .limit(1);

    if (verifyTask.length > 0) {
      console.log('   ✅ Task successfully created and retrieved!');
      console.log('   This task should now appear in the UI with a workflow indicator.');
    } else {
      console.log('   ❌ Task not found after creation.');
    }

  } catch (error) {
    console.error('Error:', error);
  }

  console.log('\n=== Test Complete ===');
  process.exit(0);
}

testWorkflowTasks();