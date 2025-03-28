import { Star as StarIcon } from 'lucide-react';
import React, { createContext, useContext, useState } from 'react';

import { cn } from '@/lib/utils';

interface StarContextProps {
  value: number;
  hoverValue: number;
  onHover: (value: number) => void;
  onChange: (value: number) => void;
  size: 'sm' | 'md' | 'lg';
}

const StarContext = createContext<StarContextProps>({
  value: 0,
  hoverValue: 0,
  onHover: () => {},
  onChange: () => {},
  size: 'md',
});

interface StarGroupProps {
  value: number;
  onChange: (value: number) => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

function StarGroup({ value, onChange, children, size = 'md' }: StarGroupProps) {
  const [hoverValue, setHoverValue] = useState<number>(0);

  return (
    <StarContext.Provider
      value={{
        value,
        hoverValue,
        onHover: setHoverValue,
        onChange,
        size,
      }}
    >
      <div 
        className="flex" 
        onMouseLeave={() => setHoverValue(0)}
      >
        {children}
      </div>
    </StarContext.Provider>
  );
}

interface StarItemProps {
  value: number;
}

function StarItem({ value }: StarItemProps) {
  const { value: selectedValue, hoverValue, onHover, onChange, size } = useContext(StarContext);
  
  // Determine if this star should be filled
  const isFilled = hoverValue >= value || (!hoverValue && selectedValue >= value);
  
  // Sizes for the stars
  const sizeMap = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-7 w-7'
  };
  
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center p-1 rounded-sm hover:scale-110 transition-transform",
        isFilled ? "text-yellow-400" : "text-muted-foreground"
      )}
      onMouseEnter={() => onHover(value)}
      onClick={() => onChange(value)}
    >
      <StarIcon 
        className={cn(
          sizeMap[size],
          isFilled && "fill-yellow-400" 
        )}
      />
    </button>
  );
}

export const Star = {
  Group: StarGroup,
  Item: StarItem,
}; 