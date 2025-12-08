import { describe, it, expect } from 'vitest';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

describe('Toggle Group Component', () => {
  it('should export ToggleGroup and ToggleGroupItem', () => {
    // Verify the imports work
    expect(ToggleGroup).toBeDefined();
    expect(ToggleGroupItem).toBeDefined();
    expect(typeof ToggleGroup).toBe('object'); // React.forwardRef returns an object
    expect(typeof ToggleGroupItem).toBe('object');
  });
});