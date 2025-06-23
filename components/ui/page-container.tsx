import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("flex-1 flex flex-col min-h-0", className)}>
      {children}
    </div>
  );
} 