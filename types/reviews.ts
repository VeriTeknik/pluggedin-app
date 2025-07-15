import { McpServerSource } from '@/db/schema';

interface ServerReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: Date;
  username: string;
}

interface ServerMetrics {
  averageRating: number;
  ratingCount: number;
  installationCount: number;
  reviews?: ServerReview[];
}

export interface MetricsResponse {
  success: boolean;
  error?: string;
  metrics?: ServerMetrics;
} 