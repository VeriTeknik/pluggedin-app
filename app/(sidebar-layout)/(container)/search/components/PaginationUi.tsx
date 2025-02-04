import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface PaginationUiProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PaginationUi({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationUiProps) {
  const showEllipsisStart = currentPage > 3;
  const showEllipsisEnd = currentPage < totalPages - 2;

  const getPageNumbers = () => {
    const pages: number[] = [];

    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // Always show first page
    pages.push(1);

    if (showEllipsisStart) {
      pages.push(-1); // -1 represents ellipsis
    }

    // Show current page and surrounding pages
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }

    if (showEllipsisEnd) {
      pages.push(-1); // -1 represents ellipsis
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <Pagination className='justify-center'>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href='#'
            onClick={(e) => {
              e.preventDefault();
              if (currentPage > 1) onPageChange(currentPage - 1);
            }}
          />
        </PaginationItem>

        {getPageNumbers().map((pageNum, idx) =>
          pageNum === -1 ? (
            <PaginationItem key={`ellipsis-${idx}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={pageNum}>
              <PaginationLink
                href='#'
                onClick={(e) => {
                  e.preventDefault();
                  onPageChange(pageNum);
                }}
                isActive={pageNum === currentPage}>
                {pageNum}
              </PaginationLink>
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <PaginationNext
            href='#'
            onClick={(e) => {
              e.preventDefault();
              if (currentPage < totalPages) onPageChange(currentPage + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
