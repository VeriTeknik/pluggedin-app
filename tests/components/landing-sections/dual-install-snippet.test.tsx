import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  tablistLabel: 'Installation method',
};

describe('DualInstallSnippet', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders both tabs and the plugin command by default', () => {
    render(<DualInstallSnippet labels={labels} />);
    expect(screen.getByRole('tablist', { name: labels.tablistLabel })).toBeInTheDocument();
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

  it('copies the plugin commands when on plugin tab', () => {
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

  it('does not throw when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DualInstallSnippet labels={labels} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    // Label must stay on "Copy" — never flip to "Copied!" on rejection.
    expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.copiedLabel })).not.toBeInTheDocument();
  });

  it('flips the button label from "Copy" to "Copied!" after a successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DualInstallSnippet labels={labels} />);

    fireEvent.click(screen.getByRole('button', { name: labels.copyLabel }));
    await screen.findByRole('button', { name: labels.copiedLabel });
    // The sr-only live region carries the same status for screen readers.
    expect(screen.getByText(labels.copiedLabel, { selector: 'span.sr-only' })).toBeInTheDocument();
  });

  describe('keyboard navigation', () => {
    it('moves to the next tab on ArrowRight and back on ArrowLeft', () => {
      render(<DualInstallSnippet labels={labels} />);
      const pluginTab = screen.getByRole('tab', { name: labels.pluginTabLabel });
      const proxyTab = screen.getByRole('tab', { name: labels.proxyTabLabel });

      fireEvent.keyDown(pluginTab, { key: 'ArrowRight' });
      expect(proxyTab).toHaveAttribute('aria-selected', 'true');
      expect(pluginTab).toHaveAttribute('aria-selected', 'false');

      fireEvent.keyDown(proxyTab, { key: 'ArrowLeft' });
      expect(pluginTab).toHaveAttribute('aria-selected', 'true');
    });

    it('wraps with Home and End', () => {
      render(<DualInstallSnippet labels={labels} defaultTab="proxy" />);
      const pluginTab = screen.getByRole('tab', { name: labels.pluginTabLabel });
      const proxyTab = screen.getByRole('tab', { name: labels.proxyTabLabel });

      fireEvent.keyDown(proxyTab, { key: 'Home' });
      expect(pluginTab).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(pluginTab, { key: 'End' });
      expect(proxyTab).toHaveAttribute('aria-selected', 'true');
    });

    it('uses roving tabindex so only the active tab is in the tab order', () => {
      render(<DualInstallSnippet labels={labels} />);
      expect(screen.getByRole('tab', { name: labels.pluginTabLabel })).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('tab', { name: labels.proxyTabLabel })).toHaveAttribute('tabindex', '-1');
    });
  });
});
