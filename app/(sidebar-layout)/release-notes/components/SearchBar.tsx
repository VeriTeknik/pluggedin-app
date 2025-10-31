'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce'; // Using use-debounce for smoother search

import { Input } from '@/components/ui/input';

interface SearchBarProps {
  onSearch: (searchTerm: string) => void;
  initialValue?: string;
  placeholder?: string;
}

export function SearchBar({
  onSearch,
  initialValue = '',
  placeholder,
}: SearchBarProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialValue);
  const [debouncedText] = useDebounce(text, 500); // Debounce input by 500ms

  useEffect(() => {
    // Trigger search only when debounced text changes
    onSearch(debouncedText);
  }, [debouncedText, onSearch]);

  return (
    <div className="relative w-full">
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder || t('releaseNotes.search.placeholder', 'Search release notes...')}
        className="w-full rounded-lg bg-background pl-12 pr-4 py-3 text-base shadow-sm border-2 focus:border-primary"
      />
    </div>
  );
}

// Add missing keys to en.json:
// "releaseNotes.search.placeholder": "Search release notes..."
