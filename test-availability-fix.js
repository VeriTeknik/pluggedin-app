// Test script to check workflow templates and fix availability check issue
// Run with: npx tsx test-availability-fix.js


import { db } from './db';
import { workflowTemplatesTable } from './db/schema';

async function checkWorkflowTemplates() {
  console.log('=== Checking Workflow Templates ===\n');

  try {
    // 1. Check all workflow templates
    console.log('1. Checking all workflow templates...');
    const templates = await db.select().from(workflowTemplatesTable);
    console.log(`   Found ${templates.length} workflow templates:`);
    
    for (const template of templates) {
      console.log(`\n   - ${template.name} (${template.category})`);
      console.log(`     ID: ${template.id}`);
      console.log(`     Active: ${template.is_active}`);
      console.log(`     Success Rate: ${template.success_rate}`);
      
      // Check if it's a scheduling template
      if (template.category === 'scheduling') {
        console.log('     *** SCHEDULING TEMPLATE ***');
        
        // Parse the base structure
        let baseStructure;
        try {
          if (typeof template.base_structure === 'string') {
            baseStructure = JSON.parse(template.base_structure);
          } else {
            baseStructure = template.base_structure;
          }
          
          if (baseStructure && baseStructure.steps) {
            console.log('     Steps:');
            for (const step of baseStructure.steps) {
              console.log(`       - ${step.id}: ${step.title}`);
              console.log(`         Type: ${step.type}`);
              console.log(`         Critical: ${step.critical || false}`);
              if (step.dependsOn) {
                console.log(`         Depends on: ${step.dependsOn.join(', ')}`);
              }
              
              // Check if this is the check_availability step
              if (step.id === 'check_availability') {
                console.log('         *** AVAILABILITY CHECK STEP ***');
                if (!step.critical) {
                  console.log('         ❌ ISSUE: check_availability is not marked as critical!');
                } else {
                  console.log('         ✅ check_availability is marked as critical');
                }
              }
              
              // Check if this is the book_meeting step
              if (step.id === 'book_meeting') {
                console.log('         *** BOOK MEETING STEP ***');
                if (!step.dependsOn || !step.dependsOn.includes('check_availability')) {
                  console.log('         ❌ ISSUE: book_meeting does not depend on check_availability!');
                } else {
                  console.log('         ✅ book_meeting depends on check_availability');
                }
              }
            }
          } else {
            console.log('     ❌ No valid steps found in base structure');
          }
        } catch (error) {
          console.log('     ❌ Error parsing base structure:', error.message);
        }
      }
    }
    
    // 2. Check if there are any scheduling templates that need fixing
    console.log('\n2. Checking for templates that need fixing...');
    const schedulingTemplates = templates.filter(t => t.category === 'scheduling');
    
    if (schedulingTemplates.length === 0) {
      console.log('   No scheduling templates found in database - using default template');
      console.log('   The default template should already have the correct configuration');
    } else {
      console.log(`   Found ${schedulingTemplates.length} scheduling templates`);
      
      for (const template of schedulingTemplates) {
        let needsFix = false;
        let baseStructure;
        
        try {
          if (typeof template.base_structure === 'string') {
            baseStructure = JSON.parse(template.base_structure);
          } else {
            baseStructure = template.base_structure;
          }
          
          if (baseStructure && baseStructure.steps) {
            for (const step of baseStructure.steps) {
              if (step.id === 'check_availability' && !step.critical) {
                console.log(`   ❌ Template ${template.id} has check_availability not marked as critical`);
                needsFix = true;
              }
              
              if (step.id === 'book_meeting' && (!step.dependsOn || !step.dependsOn.includes('check_availability'))) {
                console.log(`   ❌ Template ${template.id} has book_meeting not depending on check_availability`);
                needsFix = true;
              }
            }
          }
        } catch (error) {
          console.log(`   ❌ Error parsing template ${template.id}:`, error.message);
          needsFix = true;
        }
        
        if (needsFix) {
          console.log(`   📝 Template ${template.id} needs to be fixed`);
        } else {
          console.log(`   ✅ Template ${template.id} looks good`);
        }
      }
    }
    
    console.log('\n=== Check Complete ===');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the check
checkWorkflowTemplates();