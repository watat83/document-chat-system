/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnhancedMessageRenderer } from './enhanced-message-renderer';

// Mock the react-markdown and related dependencies
jest.mock('react-markdown', () => {
  return function MockReactMarkdown({ children }: { children: React.ReactNode }) {
    return <div data-testid="markdown-content">{children}</div>;
  };
});

jest.mock('react-syntax-highlighter', () => ({
  Prism: {
    SyntaxHighlighter: function MockSyntaxHighlighter({ children }: { children: React.ReactNode }) {
      return <pre data-testid="syntax-highlighter">{children}</pre>;
    }
  }
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {}
}));

describe('EnhancedMessageRenderer', () => {
  const mockOnCopy = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders plain text content when markdown is disabled', () => {
    const content = 'This is plain text content';
    render(
      <EnhancedMessageRenderer
        content={content}
        isMarkdown={false}
        onCopy={mockOnCopy}
      />
    );

    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it('renders markdown content when markdown is enabled', () => {
    const content = '# This is a heading\n\nThis is paragraph text.';
    render(
      <EnhancedMessageRenderer
        content={content}
        isMarkdown={true}
        onCopy={mockOnCopy}
      />
    );

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('handles URLs in content', () => {
    const content = 'Check out https://example.com for more information';
    render(
      <EnhancedMessageRenderer
        content={content}
        isMarkdown={true}
        onCopy={mockOnCopy}
      />
    );

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('applies custom CSS classes', () => {
    const content = 'Test content';
    const customClass = 'custom-class';

    render(
      <EnhancedMessageRenderer
        content={content}
        isMarkdown={false}
        className={customClass}
        onCopy={mockOnCopy}
      />
    );

    const container = screen.getByText(content).closest('.prose');
    expect(container).toHaveClass(customClass);
  });

  it('handles empty content gracefully', () => {
    render(
      <EnhancedMessageRenderer
        content=""
        isMarkdown={true}
        onCopy={mockOnCopy}
      />
    );

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('handles content with multiple URLs', () => {
    const content = 'Visit https://example.com and https://google.com';
    render(
      <EnhancedMessageRenderer
        content={content}
        isMarkdown={true}
        onCopy={mockOnCopy}
      />
    );

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });
});
