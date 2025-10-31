'use client';

import { useTranslation } from 'react-i18next';

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type FilterValue =
  | 'all'
  | 'pluggedin-app'
  | 'pluggedin-mcp'
  | 'registry-proxy'
  | 'pluggedinkit-python'
  | 'pluggedinkit-go'
  | 'pluggedinkit-js'
  | 'pluggedin-docs';

interface ReleaseFilterProps {
  currentFilter: FilterValue;
  onFilterChange: (filter: FilterValue) => void;
}

export function ReleaseFilter({ currentFilter, onFilterChange }: ReleaseFilterProps) {
  const { t } = useTranslation();

  const filters: { value: FilterValue; label: string; description: string }[] = [
    {
      value: 'all',
      label: t('releaseNotes.filters.all'),
      description: t('releaseNotes.filters.allDesc')
    },
    {
      value: 'pluggedin-app',
      label: t('releaseNotes.filters.app'),
      description: t('releaseNotes.filters.appDesc')
    },
    {
      value: 'pluggedin-mcp',
      label: t('releaseNotes.filters.mcp'),
      description: t('releaseNotes.filters.mcpDesc')
    },
    {
      value: 'registry-proxy',
      label: t('releaseNotes.filters.registryProxy'),
      description: t('releaseNotes.filters.registryProxyDesc')
    },
    {
      value: 'pluggedinkit-python',
      label: t('releaseNotes.filters.pythonSdk'),
      description: t('releaseNotes.filters.pythonSdkDesc')
    },
    {
      value: 'pluggedinkit-go',
      label: t('releaseNotes.filters.goSdk'),
      description: t('releaseNotes.filters.goSdkDesc')
    },
    {
      value: 'pluggedinkit-js',
      label: t('releaseNotes.filters.jsSdk'),
      description: t('releaseNotes.filters.jsSdkDesc')
    },
    {
      value: 'pluggedin-docs',
      label: t('releaseNotes.filters.docs'),
      description: t('releaseNotes.filters.docsDesc')
    },
  ];

  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold">{t('releaseNotes.filters.filterBy')}</Label>
      <RadioGroup
        value={currentFilter}
        onValueChange={(value) => onFilterChange(value as FilterValue)}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      >
        {filters.map((filter) => (
          <div
            key={filter.value}
            className="flex items-start space-x-3 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <RadioGroupItem
              value={filter.value}
              id={`filter-${filter.value}`}
              className="mt-1"
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={`filter-${filter.value}`}
                className="font-medium cursor-pointer leading-none"
              >
                {filter.label}
              </Label>
              <p className="text-sm text-muted-foreground leading-snug">
                {filter.description}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

// Add missing keys to en.json:
// "releaseNotes.filters.filterBy": "Filter by Repository:"
// "releaseNotes.filters.all": "All Repositories"
// "releaseNotes.filters.app": "pluggedin-app"
// "releaseNotes.filters.mcp": "pluggedin-mcp"
