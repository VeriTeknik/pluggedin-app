'use server';

import { McpServerSource } from '@/db/schema';
import { ServerReview } from '@/types/review';

export async function getReviewsForServer(
  source: McpServerSource,
  externalId: string
): Promise<ServerReview[]> {
  // Reviews system deprecated - will be replaced with new analytics service
  console.log('Reviews system deprecated - returning empty reviews list');
  return [];
}

// Action to submit or update a server review
export async function submitReview(reviewData: {
  server_source: McpServerSource;
  server_external_id: string;
  user_id: string;
  rating: number;
  comment?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  // Reviews system deprecated - will be replaced with new analytics service
  console.log('Reviews system deprecated - review submission disabled');
  return {
    success: false,
    error: 'Reviews system is temporarily unavailable. Please try again later.'
  };
}