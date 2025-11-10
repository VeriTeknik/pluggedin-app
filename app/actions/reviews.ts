'use server';

import { McpServerSource } from '@/db/schema';
import { ServerReview } from '@/types/review';
import { validateExternalIdWithLogging } from '@/lib/validation-utils';

export async function getReviewsForServer(
  source: McpServerSource,
  externalId: string
): Promise<ServerReview[]> {
  try {
    // Only fetch reviews from registry source for now
    if (source !== McpServerSource.REGISTRY) {
      return [];
    }

    // Validate externalId to prevent SSRF and path traversal attacks
    if (!validateExternalIdWithLogging(externalId, 'reviews')) {
      return [];
    }

    const response = await fetch(
      `https://registry.plugged.in/v0/servers/${externalId}/reviews`,
      {
        next: { revalidate: 60 }, // Cache for 60 seconds
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch reviews: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    return data.reviews || [];
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return [];
  }
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
  return {
    success: false,
    error: 'Reviews system is temporarily unavailable. Please try again later.'
  };
}