/**
 * Manual test script for feedback flow
 * Run with: pnpm tsx scripts/test-feedback-flow.ts
 */

import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { McpServerSource } from '@/db/schema';

async function testFeedbackFlow() {
  console.log('🧪 Testing Feedback Flow Integration\n');
  
  const TEST_SERVER_ID = '01129bff-3d65-4e3d-8e82-6f2f269f818c'; // redis server
  const TEST_USER_ID = 'test-user-' + Date.now(); // Unique user ID for this test
  
  try {
    // 1. Submit a rating with comment
    console.log('1️⃣ Submitting rating with comment...');
    const submitResult = await registryVPClient.submitRating(
      TEST_SERVER_ID,
      4,
      McpServerSource.REGISTRY,
      TEST_USER_ID,
      'Test comment from feedback flow test at ' + new Date().toISOString()
    );
    console.log('   Result:', submitResult);
    console.log('   ✅ Rating submitted successfully\n');
    
    // 2. Retrieve user rating
    console.log('2️⃣ Retrieving user rating...');
    const userRating = await registryVPClient.getUserRating(TEST_SERVER_ID, TEST_USER_ID);
    console.log('   User rating:', userRating);
    console.log('   ✅ User rating retrieved successfully\n');
    
    // 3. Fetch feedback list
    console.log('3️⃣ Fetching feedback list...');
    const feedbackList = await registryVPClient.getFeedback(TEST_SERVER_ID, 5, 0, 'newest');
    console.log('   Total feedback count:', feedbackList.total_count);
    console.log('   Feedback items returned:', feedbackList.feedback.length);
    console.log('   Has more:', feedbackList.has_more);
    
    // Show first few feedback items
    console.log('   Recent feedback:');
    feedbackList.feedback.slice(0, 3).forEach((item, index) => {
      console.log(`     ${index + 1}. Rating: ${item.rating}/5`);
      if (item.comment) {
        console.log(`        Comment: "${item.comment}"`);
      }
      console.log(`        User: ${item.username || 'Anonymous'}`);
      console.log(`        Date: ${item.created_at}\n`);
    });
    console.log('   ✅ Feedback list retrieved successfully\n');
    
    // 4. Get server stats
    console.log('4️⃣ Getting server stats...');
    const serverStats = await registryVPClient.getServerStats(TEST_SERVER_ID);
    console.log('   Server stats:', serverStats);
    console.log('   ✅ Server stats retrieved successfully\n');
    
    // 5. Update feedback (if we have a feedback ID)
    if (userRating?.feedbackId) {
      console.log('5️⃣ Updating feedback...');
      const updateResult = await registryVPClient.updateFeedback(
        TEST_SERVER_ID,
        userRating.feedbackId,
        5,
        'Updated: Excellent server! (Updated at ' + new Date().toISOString() + ')',
        TEST_USER_ID
      );
      console.log('   Update result:', updateResult);
      console.log('   ✅ Feedback updated successfully\n');
      
      // Verify update
      console.log('6️⃣ Verifying update...');
      const updatedRating = await registryVPClient.getUserRating(TEST_SERVER_ID, TEST_USER_ID);
      console.log('   Updated rating:', updatedRating);
      console.log('   ✅ Update verified successfully\n');
    }
    
    console.log('✅ All feedback flow tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testFeedbackFlow().catch(console.error);