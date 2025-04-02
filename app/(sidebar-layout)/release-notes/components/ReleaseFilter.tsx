'use client';

import { useTranslation } from 'react-i18next';

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type FilterValue = 'all' | 'pluggedin-app' | 'pluggedin-mcp';

interface ReleaseFilterProps {
  currentFilter: FilterValue;
  onFilterChange: (filter: FilterValue) => void;
}

export function ReleaseFilter({ currentFilter, onFilterChange }: ReleaseFilterProps) {
  const { t } = useTranslation();

  const filters: { value: FilterValue; label: string }[] = [
    { value: 'all', label: t('releaseNotes.filters.all', 'All Repositories') },
    { value: 'pluggedin-app', label: t('releaseNotes.filters.app', 'pluggedin-app') },
    { value: 'pluggedin-mcp', label: t('releaseNotes.filters.mcp', 'pluggedin-mcp') },
  ];

  return (
    <RadioGroup
      defaultValue={currentFilter}
      onValueChange={(value) => onFilterChange(value as FilterValue)}
      className="flex flex-wrap gap-4"
    >
      <Label className="font-medium mr-2">{t('releaseNotes.filters.filterBy', 'Filter by Repository:')}</Label>
      {filters.map((filter) => (
        <div key={filter.value} className="flex items-center space-x-2">
          <RadioGroupItem value={filter.value} id={`filter-${filter.value}`} />
          <Label htmlFor={`filter-${filter.value}`} className="font-normal cursor-pointer">
            {filter.label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

// Add missing keys to en.json:
// "releaseNotes.filters.filterBy": "Filter by Repository:"
// "releaseNotes.filters.all": "All Repositories"
// "releaseNotes.filters.app": "pluggedin-app"
// "releaseNotes.filters.mcp": "pluggedin-mcp"
