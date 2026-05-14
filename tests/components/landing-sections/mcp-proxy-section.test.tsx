import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach,describe, expect, it, vi } from 'vitest';

import { McpProxySection } from '@/components/landing-sections/mcp-proxy-section';

vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'mcpProxy.badge': 'Universal MCP Proxy',
        'mcpProxy.title': 'One Endpoint. Every MCP Server.',
        'mcpProxy.subtitle': 'Universal proxy for any client.',
        'mcpProxy.installLabel': 'MCP Proxy Install',
        'mcpProxy.copy': 'Copy',
        'mcpProxy.copied': 'Copied!',
        'mcpProxy.compat': 'Works with Cursor, Cline, ChatGPT, LM Studio',
        'mcpProxy.features.servers.title': '2,700+ MCP Servers',
        'mcpProxy.features.servers.desc': 'Massive registry.',
        'mcpProxy.features.transports.title': 'Every Transport',
        'mcpProxy.features.transports.desc': 'STDIO, SSE, HTTP.',
        'mcpProxy.features.clients.title': 'Every AI Client',
        'mcpProxy.features.clients.desc': 'Configure once.',
        'mcpProxy.features.orchestration.title': 'Built-in Orchestration',
        'mcpProxy.features.orchestration.desc': 'Playground + monitoring.',
        'mcpProxy.cta.browse': 'Browse Registry',
        'mcpProxy.cta.setupGuide': 'Setup Guide',
        'mcpProxy.cta.getApiKey': 'Get API Key',
      };
      return map[key] ?? key;
    },
    ready: true,
    i18n: { language: 'en' },
  }),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => <div {...props}>{props.children}</div>,
    },
  ),
}));

vi.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

describe('McpProxySection', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders title, subtitle, and install command', () => {
    render(<McpProxySection />);
    expect(screen.getByText('One Endpoint. Every MCP Server.')).toBeInTheDocument();
    expect(screen.getByText('Universal proxy for any client.')).toBeInTheDocument();
    expect(screen.getByText(/@pluggedin\/pluggedin-mcp-proxy@latest/)).toBeInTheDocument();
  });

  it('renders all four feature cards', () => {
    render(<McpProxySection />);
    expect(screen.getByText('2,700+ MCP Servers')).toBeInTheDocument();
    expect(screen.getByText('Every Transport')).toBeInTheDocument();
    expect(screen.getByText('Every AI Client')).toBeInTheDocument();
    expect(screen.getByText('Built-in Orchestration')).toBeInTheDocument();
  });

  it('copies the proxy command to clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<McpProxySection />);
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    expect(writeText).toHaveBeenCalledWith('npx -y @pluggedin/pluggedin-mcp-proxy@latest');
  });

  it('renders all three CTA buttons with expected hrefs', () => {
    render(<McpProxySection />);
    const browse = screen.getByRole('link', { name: /Browse Registry/i });
    const guide = screen.getByRole('link', { name: /Setup Guide/i });
    const apiKey = screen.getByRole('link', { name: /Get API Key/i });
    expect(browse).toHaveAttribute('href', '/search?source=REGISTRY&offset=0');
    expect(guide).toHaveAttribute('href', 'https://docs.plugged.in/mcp-proxy');
    expect(apiKey).toHaveAttribute('href', '/login');
  });

  it('exposes section id for nav anchor', () => {
    const { container } = render(<McpProxySection />);
    expect(container.querySelector('#mcp-proxy')).not.toBeNull();
  });

  it('does not throw when clipboard is unavailable', () => {
    Object.assign(navigator, { clipboard: undefined });
    render(<McpProxySection />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /Copy/i }))).not.toThrow();
  });

  it('does not throw when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<McpProxySection />);
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    // Allow the rejected promise to settle without surfacing as an unhandled rejection.
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
  });
});
