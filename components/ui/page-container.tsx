import { cn } from '@/lib/utils';

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function PageContainer({ className, children, ...props }: PageContainerProps) {
  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-h-0 overflow-auto',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
} 