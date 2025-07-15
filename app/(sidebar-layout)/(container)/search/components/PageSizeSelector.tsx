'use client';

import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PageSizeSelectorProps {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [6, 9, 12, 18, 24, 30];

export function PageSizeSelector({ pageSize, onPageSizeChange }: PageSizeSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">
        {t('search.itemsPerPage', 'Items per page:')}
      </span>
      <Select
        value={pageSize.toString()}
        onValueChange={(value) => onPageSizeChange(parseInt(value))}
      >
        <SelectTrigger className="w-[70px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <SelectItem key={size} value={size.toString()}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}