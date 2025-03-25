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
      placeholder={placeholder}
    />
  ) : (
    <div onClick={() => setIsEditing(true)} className="cursor-pointer">
      {value || placeholder || 'Click to edit'}
    </div>
  );
}