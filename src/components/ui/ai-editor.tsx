'use client';

import * as React from 'react';
import { Plate, usePlateEditor } from 'platejs/react';
import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import { Editor, EditorContainer, EditorView } from './editor';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface AIEditorProps {
  content?: string;
  placeholder?: string;
  onChange?: (content: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  editable?: boolean;
  className?: string;
  variant?: 'default' | 'demo' | 'fullWidth' | 'ai' | 'select' | 'none';
  minHeight?: string;
  maxHeight?: string;
  // AI-specific props
  enableAI?: boolean;
  aiModel?: string;
  // Additional props
  readOnly?: boolean;
  autoFocus?: boolean;
}

export const AIEditor = React.memo(function AIEditor({
  content = '',
  placeholder = 'Start typing...',
  onChange,
  onFocus,
  onBlur,
  editable = true,
  className,
  variant = 'default',
  minHeight = '200px',
  maxHeight,
  enableAI = true,
  aiModel,
  readOnly = false,
  autoFocus = false,
}: AIEditorProps) {
  const initialValue = React.useMemo(() => {
    if (!content || content.trim() === '') {
      return [
        {
          type: 'p',
          children: [{ text: '' }],
        },
      ];
    }

    // Simple HTML to Slate conversion
    // For more complex scenarios, you'd want a proper HTML deserializer
    const textContent = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .trim();

    return [
      {
        type: 'p',
        children: [{ text: textContent }],
      },
    ];
  }, [content]);

  const editor = usePlateEditor({
    plugins: BaseEditorKit,
    value: initialValue,
  });

  // Handle content changes
  const handleChange = React.useCallback((newValue: any) => {
    if (!onChange) return;

    try {
      // Extract text content from the editor value
      let textContent = '';
      if (newValue && Array.isArray(newValue)) {
        textContent = newValue
          .map((node: any) => {
            if (node.children && Array.isArray(node.children)) {
              return node.children
                .map((child: any) => child.text || '')
                .join('');
            }
            return '';
          })
          .join('\n');
      }

      // Convert back to HTML format for compatibility
      const htmlContent = textContent.replace(/\n/g, '<br>');
      onChange(htmlContent);
    } catch (error) {
      console.warn('Error handling editor change:', error);
    }
  }, [onChange]);

  // Update editor content when prop changes
  React.useEffect(() => {
    if (editor && content !== undefined) {
      const currentText = editor.children
        ?.map((node: any) =>
          node.children
            ?.map((child: any) => child.text || '')
            .join('')
        )
        .join('\n') || '';

      const newText = content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .trim();

      if (currentText !== newText && newText) {
        const newValue = [
          {
            type: 'p',
            children: [{ text: newText }],
          },
        ];

        // Use editor transforms to update content
        if (editor.tf?.setValue) {
          editor.tf.setValue(newValue);
        }
      }
    }
  }, [content, editor]);

  // Auto focus if requested
  React.useEffect(() => {
    if (autoFocus && editor) {
      setTimeout(() => {
        if (editor.tf?.focus) {
          editor.tf.focus();
        }
      }, 100);
    }
  }, [autoFocus, editor]);

  if (!editor) {
    return (
      <div className="border rounded-lg p-4 bg-muted/20">
        <div className="animate-pulse">Loading AI Editor...</div>
      </div>
    );
  }

  const containerStyle = {
    minHeight,
    ...(maxHeight && { maxHeight }),
  };

  return (
    <TooltipProvider>
      <Plate editor={editor} onChange={handleChange}>
        <div className={cn('w-full max-w-full overflow-hidden', className)} style={containerStyle}>
          <EditorContainer variant={variant === 'select' ? 'select' : variant === 'demo' ? 'demo' : 'default'}>
            {editable && !readOnly ? (
              <Editor
                variant={variant}
                placeholder={placeholder}
                onFocus={onFocus}
                onBlur={onBlur}
                readOnly={readOnly}
                autoFocus={autoFocus}
              />
            ) : (
              <EditorView
                variant={variant}
              />
            )}
          </EditorContainer>
        </div>
      </Plate>
    </TooltipProvider>
  );
});

export default AIEditor;
