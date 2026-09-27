import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pasting github.com/<owner>/<repo> into the smart dialog, when the registry has
 * no entry for it, used to produce `npx @<owner>/<repo>` - pre-selected, labelled
 * as coming from that repository. The GitHub owner and the npm scope are owned
 * independently, so that runs whoever holds the npm scope. It must ask instead.
 */
const m = vi.hoisted(() => ({ fetchRegistryServer: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/app/actions/registry-servers', () => ({
  fetchRegistryServer: (...a: unknown[]) => m.fetchRegistryServer(...a),
}));
vi.mock('@/app/actions/test-mcp-connection', () => ({ testMcpConnection: vi.fn() }));
vi.mock(
  '@/app/(sidebar-layout)/(container)/mcp-servers/components/smart-server-wizard/SmartServerWizard',
  () => ({ SmartServerWizard: () => null })
);

const { SmartServerDialog } = await import(
  '@/app/(sidebar-layout)/(container)/mcp-servers/components/smart-server-dialog'
);

function renderDialog() {
  const onSubmit = vi.fn(async () => undefined);
  render(
    createElement(SmartServerDialog, {
      open: true,
      onOpenChange: vi.fn(),
      onSubmit,
      isSubmitting: false,
    })
  );
  return { onSubmit };
}

function paste(value: string) {
  fireEvent.change(screen.getByPlaceholderText('Paste a URL, JSON config, or command...'), {
    target: { value },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SmartServerDialog - GitHub URL not in the registry', () => {
  it('does not invent an npm package from the owner and repository names', async () => {
    m.fetchRegistryServer.mockResolvedValue({ success: false, error: 'not found' });
    const { onSubmit } = renderDialog();

    paste('https://github.com/acme/weather-mcp');

    await waitFor(() => expect(screen.getByText('mcpServers.smartDialog.githubNotInRegistry')).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(m.fetchRegistryServer).toHaveBeenCalledWith('io.github.acme/weather-mcp');
    expect(screen.queryByText(/@acme\/weather-mcp/)).not.toBeInTheDocument();

    // Nothing is selected for the Add button to submit.
    fireEvent.click(screen.getByRole('button', { name: /Add 0 Servers/ }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('still uses the registry entry when there is one', async () => {
    m.fetchRegistryServer.mockResolvedValue({
      success: true,
      data: {
        id: 'registry-id',
        name: 'io.github.acme/weather-mcp',
        description: 'Weather',
        packages: [{ registry_name: 'npm', name: '@acme/weather-mcp' }],
      },
    });
    renderDialog();

    paste('https://github.com/acme/weather-mcp');

    await waitFor(() => expect(screen.getByText(/@acme\/weather-mcp/)).toBeInTheDocument(), {
      timeout: 3000,
    });
  });
});
