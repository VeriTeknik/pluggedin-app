'use client';

import { ChevronLeft, ChevronRight, Download, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface PDFViewerProps {
  fileUrl: string;
  className?: string;
}

export default function PDFViewer({ fileUrl, className }: PDFViewerProps) {
  const { t } = useTranslation('library');
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [userScale, setUserScale] = useState<number>(1.0); // User zoom control
  const [autoScale, setAutoScale] = useState<number>(1.0); // Auto-calculated scale to fit container
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Calculate container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && headerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const headerRect = headerRef.current.getBoundingClientRect();
        const availableHeight = containerRect.height - headerRect.height;
        
        setContainerDimensions({
          width: containerRect.width - 32, // Remove padding
          height: availableHeight - 32 // Remove padding
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Calculate auto scale when page dimensions are known
  useEffect(() => {
    if (pageDimensions.width > 0 && containerDimensions.width > 0) {
      // Always start with 100% scale (1.0) for best quality
      // User can adjust if needed with zoom controls
      setAutoScale(1.0);
    }
  }, [pageDimensions, containerDimensions, numPages]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setError(error.message);
    setIsLoading(false);
  }, []);

  const onPageLoadSuccess = useCallback((page: any) => {
    if (pageDimensions.width === 0) {
      const { width, height } = page;
      setPageDimensions({ width, height });
    }
  }, [pageDimensions.width]);

  const zoomIn = useCallback(() => {
    setUserScale(prev => {
      const newScale = Math.min(prev * 1.2, 3.0);
      return Math.round(newScale * 10) / 10; // Round to 1 decimal place
    });
  }, []);

  const zoomOut = useCallback(() => {
    setUserScale(prev => {
      const newScale = Math.max(prev / 1.2, 0.2);
      return Math.round(newScale * 10) / 10; // Round to 1 decimal place
    });
  }, []);

  const resetZoom = useCallback(() => {
    setUserScale(1.0);
  }, []);

  // Page navigation functions
  const goToPage = useCallback((pageNumber: number) => {
    const validPage = Math.max(1, Math.min(pageNumber, numPages));
    setCurrentPage(validPage);
    
    // Scroll to the specific page
    if (scrollContainerRef.current) {
      const pageElements = scrollContainerRef.current.querySelectorAll('[data-page-number]');
      const targetPage = pageElements[validPage - 1] as HTMLElement;
      if (targetPage) {
        targetPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [numPages]);

  const goToPrevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  // Final scale is auto scale * user scale
  const finalScale = autoScale * userScale;

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center">
          <p className="text-destructive mb-2">{t('preview.pdfError')}</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => window.open(fileUrl, '_blank')}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('preview.downloadPDF')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative h-full w-full ${className}`}>
      {/* PDF Controls */}
      <div 
        ref={headerRef}
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur"
      >
        <div className="flex items-center gap-4">
          {/* Page Navigation */}
          {numPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevPage}
                disabled={currentPage <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value) || 1;
                    goToPage(page);
                  }}
                  className="w-16 h-8 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min={1}
                  max={numPages}
                  disabled={isLoading}
                />
                <span className="text-sm text-muted-foreground">
                  / {numPages}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={goToNextPage}
                disabled={currentPage >= numPages || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* PDF Info */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {numPages > 0 ? `${numPages} sayfa` : 'Yükleniyor...'}
            </span>
            <span className="text-xs text-muted-foreground">
              • Zoom: {Math.round(userScale * 100)}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={zoomOut}
            disabled={userScale <= 0.2 || isLoading}
            title="Küçült"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={resetZoom}
            disabled={isLoading}
            className="min-w-[70px]"
            title="Zoom'u sıfırla (%100)"
          >
            {Math.round(userScale * 100)}%
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={zoomIn}
            disabled={userScale >= 3.0 || isLoading}
            title="Büyüt"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6 mx-2" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(fileUrl, '_blank')}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content - scrollable area */}
      <div 
        ref={scrollContainerRef}
        className="absolute inset-0 pt-[73px] overflow-auto bg-gray-100 dark:bg-gray-900"
      >
        <div className="p-4">
          <div className="flex flex-col items-center gap-4">
            {isLoading && (
              <div className="flex items-center justify-center h-96">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>{t('preview.loadingPDF')}</span>
                </div>
              </div>
            )}
            
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading=""
            >
              {numPages > 0 && Array.from(
                { length: numPages },
                (_, index) => (
                  <div 
                    key={`page_${index + 1}`} 
                    data-page-number={index + 1}
                    className="bg-white shadow-lg mb-4 last:mb-0 rounded-lg overflow-hidden"
                  >
                    <Page
                      pageNumber={index + 1}
                      scale={finalScale}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      onLoadSuccess={index === 0 ? onPageLoadSuccess : undefined}
                      className="block"
                    />
                  </div>
                )
              )}
            </Document>
          </div>
        </div>
      </div>
    </div>
  );
}