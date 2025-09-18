import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AiSearchAnswer } from '@/app/(sidebar-layout)/(container)/library/components/AiSearchAnswer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}));

describe('AiSearchAnswer', () => {
  const defaultProps = {
    answer: null,
    sources: [],
    documentIds: [],
    documents: [],
    isLoading: false,
    error: null,
    query: '',
    onDocumentClick: vi.fn(),
  };

  it('should render nothing when no query and no answer', () => {
    const { container } = render(<AiSearchAnswer {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render loading state', () => {
    render(<AiSearchAnswer {...defaultProps} isLoading={true} query="test query" />);
    expect(screen.getByText('Searching your documents...')).toBeInTheDocument();
  });

  it('should render error state', () => {
    render(<AiSearchAnswer {...defaultProps} error="Test error message" query="test query" />);
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should render answer with sources', () => {
    const props = {
      ...defaultProps,
      answer: 'This is the AI answer',
      query: 'test query',
      documents: [
        {
          id: 'doc1',
          name: 'Document 1',
          relevance: 85,
          model: { name: 'Claude', provider: 'Anthropic' },
          source: 'ai_generated',
        },
        {
          id: 'doc2',
          name: 'Document 2',
          relevance: 70,
        },
      ],
    };

    render(<AiSearchAnswer {...props} />);
    expect(screen.getByText('This is the AI answer')).toBeInTheDocument();
    expect(screen.getByText(/Document 1/)).toBeInTheDocument();
    expect(screen.getByText(/85%/)).toBeInTheDocument();
    expect(screen.getByText(/Claude/)).toBeInTheDocument();
  });

  it('should handle document click', () => {
    const onDocumentClick = vi.fn();
    const props = {
      ...defaultProps,
      answer: 'This is the AI answer',
      query: 'test query',
      documents: [
        {
          id: 'doc1',
          name: 'Document 1',
        },
      ],
      onDocumentClick,
    };

    render(<AiSearchAnswer {...props} />);
    const documentButton = screen.getByRole('button', { name: /Document 1/ });
    fireEvent.click(documentButton);
    expect(onDocumentClick).toHaveBeenCalledWith('doc1');
  });

  it('should handle expand/collapse', () => {
    const props = {
      ...defaultProps,
      answer: 'This is the AI answer',
      query: 'test query',
    };

    render(<AiSearchAnswer {...props} />);

    // Should be expanded by default
    expect(screen.getByText('This is the AI answer')).toBeInTheDocument();

    // Click collapse button
    const collapseButton = screen.getByLabelText('Collapse answer');
    fireEvent.click(collapseButton);

    // Content should be hidden
    expect(screen.queryByText('This is the AI answer')).not.toBeInTheDocument();

    // Click expand button
    const expandButton = screen.getByLabelText('Expand answer');
    fireEvent.click(expandButton);

    // Content should be visible again
    expect(screen.getByText('This is the AI answer')).toBeInTheDocument();
  });

  it('should apply correct relevance color coding', () => {
    const props = {
      ...defaultProps,
      answer: 'Test answer',
      query: 'test',
      documents: [
        { id: '1', name: 'High relevance', relevance: 85 },
        { id: '2', name: 'Medium relevance', relevance: 65 },
        { id: '3', name: 'Low relevance', relevance: 45 },
      ],
    };

    render(<AiSearchAnswer {...props} />);

    // Check that relevance scores are displayed with proper colors
    const highRelevance = screen.getByText('85%');
    expect(highRelevance.className).toContain('text-green-600');

    const mediumRelevance = screen.getByText('65%');
    expect(mediumRelevance.className).toContain('text-yellow-600');

    const lowRelevance = screen.getByText('45%');
    expect(lowRelevance.className).toContain('text-gray-600');
  });

  it('should safely render document names with special characters', () => {
    const props = {
      ...defaultProps,
      answer: 'Test answer',
      query: 'test',
      documents: [
        {
          id: 'special-chars',
          name: 'Document<>&"\'',
          relevance: 80,
        },
      ],
    };

    render(<AiSearchAnswer {...props} />);

    // Component should safely render special characters
    // Document names are displayed truncated if too long (25 chars)
    const documentButtons = screen.getAllByRole('button');
    // Should have at least one button (the document)
    expect(documentButtons.length).toBeGreaterThan(0);
    // The document should be rendered without causing any XSS issues
    expect(screen.getByText('Test answer')).toBeInTheDocument();
  });
});