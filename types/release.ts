// Define the structure for categorized changes within a release
export interface ReleaseChange {
  type: 'Feature' | 'Bug Fix' | 'Performance Improvement' | 'Breaking Change' | 'Other';
  message: string;
  commitUrl?: string; // Link to the specific commit or PR
  contributors?: string[]; // List of contributors for this change
}

// Define the main structure for a single release note entry
export interface ReleaseNote {
  id?: number; // Optional database ID
  repository: 'pluggedin-app' | 'pluggedin-mcp';
  version: string; // e.g., "v1.2.0"
  releaseDate: string; // ISO date string
  commitSha: string; // SHA of the release commit/tag
  content: {
    body?: string; // Release body content in markdown/html format
    features?: ReleaseChange[];
    bugFixes?: ReleaseChange[];
    performanceImprovements?: ReleaseChange[];
    breakingChanges?: ReleaseChange[];
    otherChanges?: ReleaseChange[];
  };
  createdAt?: string; // Optional database timestamp
  updatedAt?: string; // Optional database timestamp
}

// Type for the data stored in the database (matches schema.ts jsonb structure)
export type ReleaseNoteContentDb = ReleaseNote['content'];
