import { useState, useCallback } from 'react';
import { ConsoleCapture } from '@/lib/utils/console-capture';

interface UseConsoleCaptureOptions {
  onCapture?: (logs: string[]) => void;
  clearOnStart?: boolean;
}

/**
 * Hook for capturing console output during async operations
 */
export function useConsoleCapture(options: UseConsoleCaptureOptions = {}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const captureAsync = useCallback(async <T,>(
    fn: () => Promise<T>
  ): Promise<T> => {
    if (options.clearOnStart) {
      setLogs([]);
    }
    
    setIsCapturing(true);
    
    try {
      const { result, output } = await ConsoleCapture.captureAsync(fn);
      
      setLogs(prevLogs => 
        options.clearOnStart ? output : [...prevLogs, ...output]
      );
      
      options.onCapture?.(output);
      
      return result;
    } finally {
      setIsCapturing(false);
    }
  }, [options]);
  
  const capture = useCallback(<T,>(
    fn: () => T
  ): T => {
    if (options.clearOnStart) {
      setLogs([]);
    }
    
    setIsCapturing(true);
    
    try {
      const { result, output } = ConsoleCapture.capture(fn);
      
      setLogs(prevLogs => 
        options.clearOnStart ? output : [...prevLogs, ...output]
      );
      
      options.onCapture?.(output);
      
      return result;
    } finally {
      setIsCapturing(false);
    }
  }, [options]);
  
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);
  
  const appendLog = useCallback((message: string, type: 'log' | 'error' | 'warn' | 'info' = 'log') => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const formattedLog = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    setLogs(prev => [...prev, formattedLog]);
  }, []);
  
  return {
    logs,
    isCapturing,
    captureAsync,
    capture,
    clearLogs,
    appendLog,
  };
}

/**
 * Example usage in a component:
 * 
 * const { logs, captureAsync, clearLogs } = useConsoleCapture({
 *   clearOnStart: true,
 *   onCapture: (newLogs) => {
 *     console.log('Captured logs:', newLogs);
 *   }
 * });
 * 
 * const handleAction = async () => {
 *   const result = await captureAsync(async () => {
 *     console.log('This will be captured');
 *     return await someAsyncOperation();
 *   });
 * };
 */