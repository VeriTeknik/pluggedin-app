import { Feed } from 'feed';
import { NextResponse } from 'next/server';

import { getReleaseNotes } from '@/app/actions/release-notes';
import type { ReleaseChange } from '@/types/release';

export async function GET() {
  try {
    // Create a new feed
    const feed = new Feed({
      title: 'Plugged.in Release Notes',
      description: 'Latest releases and updates from Plugged.in',
      id: 'https://plugged.in/release-notes',
      link: 'https://plugged.in/release-notes',
      language: 'en',
      favicon: 'https://plugged.in/favicon.ico',
      copyright: `All rights reserved ${new Date().getFullYear()}`,
    });

    // Get all release notes
    const notes = await getReleaseNotes('all', 1, 50); // Get latest 50 releases

    // Add items to feed
    notes.forEach((note) => {
      const content = note.content.body || 
        Object.entries(note.content)
          .filter(([key, value]) => Array.isArray(value) && value.length > 0)
          .map(([key, changes]) => {
            const title = key.replace(/([A-Z])/g, ' $1').toLowerCase();
            const changeList = changes as ReleaseChange[];
            return `
              <h3>${title}</h3>
              <ul>
                ${changeList.map((change) => `
                  <li>
                    ${change.message}
                    ${change.commitUrl ? `(<a href="${change.commitUrl}">view commit</a>)` : ''}
                    ${change.contributors?.length ? `by ${change.contributors.join(', ')}` : ''}
                  </li>
                `).join('')}
              </ul>
            `;
          })
          .join('');

      feed.addItem({
        title: `${note.repository} ${note.version}`,
        id: `${note.repository}-${note.version}`,
        link: `https://github.com/VeriTeknik/${note.repository}/releases/tag/${note.version}`,
        description: content,
        date: new Date(note.releaseDate),
        content,
      });
    });

    // Return the feed as XML
    return new NextResponse(feed.rss2(), {
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  } catch (error) {
    console.error('Error generating RSS feed:', error);
    return NextResponse.json(
      { error: 'Failed to generate RSS feed' },
      { status: 500 }
    );
  }
} 