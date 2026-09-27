/**
 * The blog post page embeds JSON-LD with dangerouslySetInnerHTML. JSON.stringify
 * does not escape `<`, so an author name like `</script><meta http-equiv=refresh ...>`
 * closed the script element and injected markup into every visitor's page.
 * users.name is free text the author controls through /api/settings/profile.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBlogPostBySlug = vi.fn();

vi.mock('@/app/blog/actions', () => ({ getBlogPostBySlug }));
vi.mock('@/app/blog/[slug]/blog-content', () => ({ BlogContent: () => null }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const PAYLOAD = '</script><meta http-equiv="refresh" content="0;url=https://evil.example"><script>alert(1)</script>';

function post(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      category: 'technical',
      is_featured: false,
      tags: [],
      published_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-02T00:00:00Z'),
      reading_time_minutes: 3,
      view_count: 1,
      header_image_url: null,
      header_image_alt: null,
      og_image_url: null,
      author: { name: PAYLOAD },
      translations: [{ language: 'en', title: 'Title <b>', excerpt: 'Excerpt', content: 'Body' }],
      ...overrides,
    },
  };
}

async function renderPage(): Promise<string> {
  const { default: BlogPostPage } = await import('@/app/blog/[slug]/page');
  const element = await BlogPostPage({ params: Promise.resolve({ slug: 'a-post' }) });
  return renderToStaticMarkup(createElement('div', null, element));
}

function jsonLdScripts(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(
    (s) => s.textContent ?? ''
  );
}

describe('blog post JSON-LD', () => {
  beforeEach(() => {
    getBlogPostBySlug.mockReset();
    getBlogPostBySlug.mockResolvedValue(post());
  });

  it('does not let an author name close the script element', async () => {
    const html = await renderPage();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // The injected <meta> and the second <script> must not exist as elements.
    expect(doc.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(doc.querySelectorAll('script').length).toBe(1);
    expect(html).not.toContain('</script><meta');
  });

  it('still emits valid JSON-LD carrying the original values', async () => {
    const html = await renderPage();
    const scripts = jsonLdScripts(html);

    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0]);
    expect(data['@type']).toBe('BlogPosting');
    expect(data.author.name).toBe(PAYLOAD);
    expect(data.headline).toBe('Title <b>');
  });
});
