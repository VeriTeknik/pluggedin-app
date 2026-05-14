import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach,describe, expect, it, vi } from 'vitest';

import { DualInstallSnippet } from '@/components/landing-sections/dual-install-snippet';

const labels = {
  pluginTabLabel: 'Claude Code Plugin',
  proxyTabLabel: 'MCP Proxy (other clients)',
  pluginCaption: 'Claude Code · 30 seconds · zero config',
  proxyCaption: 'Cursor · Cline · ChatGPT · LM Studio',
  copyLabel: 'Copy',
  copiedLabel: 'Copied!',
  pluginSetupHint: 'Sign in via browser',
  proxySetupHint: 'Universal MCP proxy',
};

describe('DualInstallSnippet', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders both tabs and the plugin command by default', () => {
    render(<DualInstallSnippet labels={labels} />);
    expect(screen.getByRole('tab', { name: labels.pluginTabLabel })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: labels.proxyTabLabel })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText(/VeriTeknik\/pluggedin-plugin/)).toBeInTheDocument();
    expect(screen.getByText(labels.pluginCaption)).toBeInTheDocument();
  });

  it('switches to proxy tab and shows the npx command', () => {
    render(<DualInstallSnippet labels={labels} />);
    fireEvent.click(screen.getByRole('tab', { name: labels.proxyTabLabel }));
    expect(screen.getByRole('tab', { name: labels.proxyTabLabel })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/@pluggedin\/pluggedin-mcp-proxy@latest/)).toBeInTheDocument();
    expect(screen.getByText(labels.proxyCaption)).toBeInTheDocument();
  });

  it('copies the plugin commands when on plugin tab', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DualInstallSnippet labels={labels} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('VeriTeknik/pluggedin-plugin');
    expect(writeText.mock.calls[0][0]).toContain('/pluggedin:setup');
  });

  it('copies the proxy command when on proxy tab', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DualInstallSnippet labels={labels} />);
    fireEvent.click(screen.getByRole('tab', { name: labels.proxyTabLabel }));
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe('npx -y @pluggedin/pluggedin-mcp-proxy@latest');
  });

  it('honors defaultTab="proxy"', () => {
    render(<DualInstallSnippet labels={labels} defaultTab="proxy" />);
    expect(screen.getByRole('tab', { name: labels.proxyTabLabel })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/@pluggedin\/pluggedin-mcp-proxy@latest/)).toBeInTheDocument();
  });

  it('does not throw when clipboard is unavailable', () => {
    Object.assign(navigator, { clipboard: undefined });
    render(<DualInstallSnippet labels={labels} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /Copy/i }))).not.toThrow();
  });
});
