import { NextResponse } from 'next/server';

import { getReleaseNotes, searchReleaseNotes } from '@/app/actions/release-notes';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repository = searchParams.get('repository') as 'pluggedin-app' | 'pluggedin-mcp' | 'all' | null;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const query = searchParams.get('query'); // For search functionality

  try {
    let notes;
    if (query) {
      // If a search query is present, use the search action
      notes = await searchReleaseNotes(query, repository || 'all');
      // Note: Pagination might need adjustment for search results if required
    } else {
      // Otherwise, fetch paginated notes
      notes = await getReleaseNotes(repository || 'all', page, limit);
    }
    return NextResponse.json(notes);
  } catch (error: any) {
    console.error('Error fetching release notes via API:', error);
    return NextResponse.json({ error: 'Failed to fetch release notes', details: error.message }, { status: 500 });
  }
}

// Optional: POST endpoint to trigger updates (e.g., from a webhook)
// Ensure proper security/authentication for this endpoint if implemented
// export async function POST(request: Request) {
//   try {
//     // Add authentication/authorization check here
//     const result = await updateReleaseNotesFromGitHub();
//     if (result.success) {
//       return NextResponse.json({ message: result.message });
//     } else {
//       return NextResponse.json({ error: result.message, details: result.error }, { status: 500 });
//     }
//   } catch (error: any) {
//     console.error('Error triggering release notes update via API:', error);
//     return NextResponse.json({ error: 'Failed to trigger update', details: error.message }, { status: 500 });
//   }
// }
