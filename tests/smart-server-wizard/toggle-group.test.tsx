import { describe, it, expect } from 'vitest';

describe('Toggle Group Component', () => {
  it('should export ToggleGroup and ToggleGroupItem', async () => {
    const toggleGroupModule = await import('@/components/ui/toggle-group');

    expect(toggleGroupModule).toBeDefined();
    expect(toggleGroupModule.ToggleGroup).toBeDefined();
    expect(toggleGroupModule.ToggleGroupItem).toBeDefined();
  });
});
