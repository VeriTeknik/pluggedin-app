import { describe, it, expect, beforeAll } from 'vitest';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { McpServerSource } from '@/db/schema';

describe('Feedback Flow Integration', () => {
  const TEST_SERVER_ID = '01129bff-3d65-4e3d-8e82-6f2f269f818c'; // redis server
  const TEST_USER_ID = 'test-user-123';
  
  beforeAll(() => {
    // Ensure we have the necessary environment variables
    if (!process.env.REGISTRY_VP_API_KEY) {
      throw new Error('REGISTRY_VP_API_KEY is required for testing');
    }
  });

  it('should submit a rating with comment', async () => {
    const rating = 4;
    const comment = 'Great server for Redis integration!';
    
    const result = await registryVPClient.submitRating(
      TEST_SERVER_ID,
      rating,
      McpServerSource.REGISTRY,
      TEST_USER_ID,
      comment
    );
    
    expect(result.success).toBe(true);
    expect(result.feedbackId).toBeDefined();
  });

  it('should retrieve user rating', async () => {
    const result = await registryVPClient.getUserRating(TEST_SERVER_ID, TEST_USER_ID);
    
    expect(result).toBeDefined();
    expect(result?.rating).toBeGreaterThanOrEqual(1);
    expect(result?.rating).toBeLessThanOrEqual(5);
    expect(result?.feedbackId).toBeDefined();
  });

  it('should fetch feedback list with comments', async () => {
    const result = await registryVPClient.getFeedback(TEST_SERVER_ID, 10, 0, 'newest');
    
    expect(result).toBeDefined();
    expect(result.feedback).toBeInstanceOf(Array);
    expect(result.total_count).toBeGreaterThanOrEqual(0);
    expect(result.has_more).toBe(typeof result.has_more === 'boolean');
    
    // Check if at least one feedback has a comment
    const feedbackWithComment = result.feedback.find(f => f.comment);
    if (feedbackWithComment) {
      expect(feedbackWithComment.comment).toBeTruthy();
      expect(feedbackWithComment.rating).toBeGreaterThanOrEqual(1);
      expect(feedbackWithComment.rating).toBeLessThanOrEqual(5);
    }
  });

  it('should get server stats including rating count', async () => {
    const stats = await registryVPClient.getServerStats(TEST_SERVER_ID);
    
    expect(stats).toBeDefined();
    expect(stats?.rating).toBeGreaterThanOrEqual(0);
    expect(stats?.rating_count).toBeGreaterThanOrEqual(0);
    expect(stats?.installation_count).toBeGreaterThanOrEqual(0);
  });

  it('should update existing feedback', async () => {
    // First get the user's existing rating
    const existingRating = await registryVPClient.getUserRating(TEST_SERVER_ID, TEST_USER_ID);
    
    if (existingRating?.feedbackId) {
      const newRating = 5;
      const newComment = 'Updated: Excellent Redis integration!';
      
      const result = await registryVPClient.updateFeedback(
        TEST_SERVER_ID,
        existingRating.feedbackId,
        newRating,
        newComment,
        TEST_USER_ID
      );
      
      expect(result.success).toBe(true);
      
      // Verify the update
      const updatedRating = await registryVPClient.getUserRating(TEST_SERVER_ID, TEST_USER_ID);
      expect(updatedRating?.rating).toBe(newRating);
      expect(updatedRating?.comment).toBe(newComment);
    }
  });
});