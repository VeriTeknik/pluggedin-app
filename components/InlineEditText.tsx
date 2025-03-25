// InlineEditText.tsx
import { useEffect,useState } from 'react';

import { Input } from '@/components/ui/input';

interface InlineEditTextProps {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
}

export default function InlineEditText({ value, onSave, placeholder }: InlineEditTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return isEditing ? (
    <Input
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        onSave(localValue);
        setIsEditing(false);
      }}
      autoFocus
      aria-label="Editing text"
      role="textbox"
      placeholder={placeholder}
    />
  ) : (
    <div
      tabIndex={0}
      role="textbox"
      aria-label="Editable text. Press Enter or Space to edit."
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); // Prevent scrolling on space
          setIsEditing(true);
        }
      }}
      className="cursor-pointer"
    >
      {value || placeholder || 'Click to edit'}
    </div>
  );
}