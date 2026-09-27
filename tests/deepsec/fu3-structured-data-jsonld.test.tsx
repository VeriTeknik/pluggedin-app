/**
 * components/seo/structured-data.tsx emitted JSON-LD with
 * `dangerouslySetInnerHTML={{ __html: JSON.stringify(s) }}`. JSON.stringify
 * leaves `<` alone, so any value containing `</script>` (a breadcrumb name, or
 * anything merged in through the `data` prop) closed the element and the rest
 * was parsed as HTML. The blog page already moved to serializeJsonLd; this
 * component now uses it too.
 */
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// next/script defers afterInteractive scripts to the client; render a plain
// <script> so the markup the browser would parse is visible here.
vi.mock('next/script', () => ({
  default: (props: { id?: string; type?: string; dangerouslySetInnerHTML?: { __html: string }; children?: ReactNode }) =>
    createElement('script', { id: props.id, type: props.type, dangerouslySetInnerHTML: props.dangerouslySetInnerHTML }),
}));

const PAYLOAD = '</script><img src=x onerror=alert(1)><script>';

async function render(props: Record<string, unknown>): Promise<string> {
  const { StructuredData } = await import('@/components/seo/structured-data');
  return renderToStaticMarkup(createElement(StructuredData, props));
}

function jsonLdScripts(html: string): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map((s) => s.textContent ?? '');
}

describe('StructuredData JSON-LD', () => {
  it('cannot be broken out of by a value containing </script>', async () => {
    const html = await render({
      type: 'BreadcrumbList',
      data: { items: [{ name: PAYLOAD, url: 'https://plugged.in/x' }] },
    });

    expect(html).not.toContain('</script><img');
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    expect(doc.querySelector('img')).toBeNull();

    const scripts = jsonLdScripts(html);
    expect(scripts).toHaveLength(1);
    // Still valid JSON with the original value.
    expect(JSON.parse(scripts[0]).itemListElement[0].name).toBe(PAYLOAD);
  });

  it('escapes values merged in through the `data` prop as well', async () => {
    const html = await render({ type: 'Unknown' as never, data: { description: PAYLOAD } });

    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    expect(doc.querySelector('img')).toBeNull();
    expect(JSON.parse(jsonLdScripts(html)[0]).description).toBe(PAYLOAD);
  });

  it('still renders the default schemas as parseable JSON', async () => {
    const html = await render({ type: 'Organization' });

    const scripts = jsonLdScripts(html);
    expect(scripts).toHaveLength(2);
    expect(JSON.parse(scripts[0])['@type']).toBe('Organization');
  });
});
