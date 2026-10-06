'use client'
import { ErrorBoundary } from 'react-error-boundary'

import React, { useState, useCallback } from 'react'
import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,
  BlockquotePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
} from '@platejs/basic-nodes/react'
import {
  ParagraphPlugin,
  Plate,
  PlateContent,
  usePlateEditor,
} from '@platejs/core/react'
import { Transforms } from 'slate'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  Code, 
  Quote, 
  Heading1, 
  Heading2, 
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  Link,
  Image,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Type,
  Palette,
  Search,
  Replace,
  Download,
  Upload,
  Subscript,
  Superscript,
  Minus,
  Hash,
  AtSign,
  Smile,
  Indent,
  Outdent,
  RotateCcw,
  FileText,
  Eye,
  EyeOff,
  Settings
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PlateEditorProps {
  content?: string
  placeholder?: string
  onChange?: (content: string) => void
  onFocus?: () => void
  onBlur?: () => void
  editable?: boolean
  className?: string
  minHeight?: string
  maxHeight?: string
  showToolbar?: boolean
  toolbarClassName?: string
  // Advanced features
  showAdvancedToolbar?: boolean
  enableSearch?: boolean
  enableWordCount?: boolean
  enableExport?: boolean
  compact?: boolean
  // Styling options
  theme?: 'default' | 'minimal' | 'modern'
  borderless?: boolean
  // Callback functions
  onSave?: (content: string) => void
  onExport?: (content: string, format: 'html' | 'markdown' | 'text') => void
  onWordCountChange?: (count: number) => void
  // Instance isolation
  id?: string
}

interface ButtonConfig {
  label: string
  isActive: boolean
  action: () => void
  icon: React.ReactNode
  className?: string
  disabled?: boolean
  tooltip?: string
}

interface ToolbarProps {
  editor: any
  className?: string
  compact?: boolean
  showAdvanced?: boolean
  theme?: 'default' | 'minimal' | 'modern'
}

interface WordCountState {
  words: number
  characters: number
  charactersNoSpaces: number
}

const Toolbar: React.FC<ToolbarProps> = ({ 
  editor, 
  className = '', 
  compact = false, 
  showAdvanced = false,
  theme = 'default' 
}) => {
  const [showSearch, setShowSearch] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showInsertMenu, setShowInsertMenu] = useState(false)

  if (!editor) {
    return null
  }

  // Check if marks are active using the correct editor API
  const isBoldActive = editor?.api?.hasMark?.(BoldPlugin.key) || false
  const isItalicActive = editor?.api?.hasMark?.(ItalicPlugin.key) || false
  const isUnderlineActive = editor?.api?.hasMark?.(UnderlinePlugin.key) || false
  const isStrikethroughActive = editor?.api?.hasMark?.(StrikethroughPlugin.key) || false
  const isCodeActive = editor?.api?.hasMark?.(CodePlugin.key) || false

  // Enhanced block type checking
  const getCurrentBlockType = () => {
    try {
      const selection = editor?.api?.getSelection?.()
      if (!selection) return ParagraphPlugin.key
      
      const node = editor?.api?.getNode?.(selection.anchor.path)
      return node?.type || ParagraphPlugin.key
    } catch {
      return ParagraphPlugin.key
    }
  }

  const currentBlockType = getCurrentBlockType()
  const isH1Active = currentBlockType === H1Plugin.key
  const isH2Active = currentBlockType === H2Plugin.key
  const isH3Active = currentBlockType === H3Plugin.key
  const isH4Active = currentBlockType === H4Plugin.key
  const isH5Active = currentBlockType === H5Plugin.key
  const isH6Active = currentBlockType === H6Plugin.key
  const isBlockquoteActive = currentBlockType === BlockquotePlugin.key
  const isParagraphActive = currentBlockType === ParagraphPlugin.key

  // Basic formatting buttons
  const formatButtons: ButtonConfig[] = [
    {
      label: 'Bold',
      isActive: isBoldActive,
      action: () => {
        console.log('Bold clicked - editor:', !!editor, 'has tf:', !!editor?.tf, 'has toggleMark:', !!editor?.tf?.toggleMark)
        editor?.tf?.toggleMark?.(BoldPlugin.key)
      },
      icon: <Bold className="h-4 w-4" />,
      tooltip: 'Bold (Ctrl+B)'
    },
    {
      label: 'Italic',
      isActive: isItalicActive,
      action: () => editor?.tf?.toggleMark?.(ItalicPlugin.key),
      icon: <Italic className="h-4 w-4" />,
      tooltip: 'Italic (Ctrl+I)'
    },
    {
      label: 'Underline',
      isActive: isUnderlineActive,
      action: () => editor?.tf?.toggleMark?.(UnderlinePlugin.key),
      icon: <Underline className="h-4 w-4" />,
      tooltip: 'Underline (Ctrl+U)'
    },
    {
      label: 'Strikethrough',
      isActive: isStrikethroughActive,
      action: () => editor?.tf?.toggleMark?.(StrikethroughPlugin.key),
      icon: <Strikethrough className="h-4 w-4" />,
      tooltip: 'Strikethrough (Ctrl+Shift+X)'
    },
    {
      label: 'Code',
      isActive: isCodeActive,
      action: () => editor?.tf?.toggleMark?.(CodePlugin.key),
      icon: <Code className="h-4 w-4" />,
      tooltip: 'Inline Code (Ctrl+E)'
    },
  ]

  // Block type buttons
  const blockButtons: ButtonConfig[] = [
    {
      label: 'Heading 1',
      isActive: isH1Active,
      action: () => {
        console.log('H1 clicked - using Slate transforms')
        try {
          if (editor && editor.selection) {
            Transforms.setNodes(
              editor,
              { type: H1Plugin.key },
              { 
                match: n => n.type === ParagraphPlugin.key || n.type?.startsWith('h'),
                split: true 
              }
            )
          } else {
            console.warn('No editor or selection available')
          }
        } catch (error) {
          console.error('Error setting H1:', error)
        }
      },
      icon: <Heading1 className="h-4 w-4" />,
      tooltip: 'Heading 1 (Ctrl+Alt+1)'
    },
    {
      label: 'Heading 2',
      isActive: isH2Active,
      action: () => {
        if (editor && editor.selection) {
          Transforms.setNodes(editor, { type: H2Plugin.key }, { 
            match: n => n.type === ParagraphPlugin.key || n.type?.startsWith('h'),
            split: true 
          })
        }
      },
      icon: <Heading2 className="h-4 w-4" />,
      tooltip: 'Heading 2 (Ctrl+Alt+2)'
    },
    {
      label: 'Heading 3',
      isActive: isH3Active,
      action: () => {
        if (editor && editor.selection) {
          Transforms.setNodes(editor, { type: H3Plugin.key }, { 
            match: n => n.type === ParagraphPlugin.key || n.type?.startsWith('h'),
            split: true 
          })
        }
      },
      icon: <Heading3 className="h-4 w-4" />,
      tooltip: 'Heading 3 (Ctrl+Alt+3)'
    },
    {
      label: 'Quote',
      isActive: isBlockquoteActive,
      action: () => {
        if (editor && editor.selection) {
          Transforms.setNodes(editor, { type: BlockquotePlugin.key }, { 
            match: n => n.type === ParagraphPlugin.key || n.type?.startsWith('h') || n.type === BlockquotePlugin.key,
            split: true 
          })
        }
      },
      icon: <Quote className="h-4 w-4" />,
      tooltip: 'Blockquote (Ctrl+Shift+.)'
    },
    {
      label: 'Normal Text',
      isActive: isParagraphActive,
      action: () => {
        if (editor && editor.selection) {
          Transforms.setNodes(editor, { type: ParagraphPlugin.key }, { 
            match: n => n.type?.startsWith('h') || n.type === BlockquotePlugin.key,
            split: true 
          })
        }
      },
      icon: <Type className="h-4 w-4" />,
      tooltip: 'Normal paragraph'
    },
  ]

  // Advanced block buttons (only shown when showAdvanced is true)
  const advancedBlockButtons: ButtonConfig[] = [
    {
      label: 'Heading 4',
      isActive: isH4Active,
      action: () => editor?.tf?.setElement?.({ type: H4Plugin.key }),
      icon: <Heading4 className="h-4 w-4" />,
      tooltip: 'Heading 4 (Ctrl+Alt+4)'
    },
    {
      label: 'Heading 5',
      isActive: isH5Active,
      action: () => editor?.tf?.setElement?.({ type: H5Plugin.key }),
      icon: <Heading5 className="h-4 w-4" />,
      tooltip: 'Heading 5 (Ctrl+Alt+5)'
    },
    {
      label: 'Heading 6',
      isActive: isH6Active,
      action: () => editor?.tf?.setElement?.({ type: H6Plugin.key }),
      icon: <Heading6 className="h-4 w-4" />,
      tooltip: 'Heading 6 (Ctrl+Alt+6)'
    },
  ]

  // Insert and utility buttons
  const insertButtons: ButtonConfig[] = [
    {
      label: 'Insert Link',
      isActive: false,
      action: () => {
        const url = window.prompt('Enter URL:')
        const text = window.prompt('Enter link text (optional):')
        if (url) {
          const linkText = text || url
          editor?.tf?.insertText?.(`[${linkText}](${url})`)
        }
      },
      icon: <Link className="h-4 w-4" />,
      tooltip: 'Insert Link'
    },
    {
      label: 'Insert Image',
      isActive: false,
      action: () => {
        const url = window.prompt('Enter Image URL:')
        const alt = window.prompt('Enter alt text (optional):')
        if (url) {
          editor?.tf?.insertText?.(`![${alt || 'Image'}](${url})`)
        }
      },
      icon: <Image className="h-4 w-4" />,
      tooltip: 'Insert Image'
    },
    {
      label: 'Insert Horizontal Rule',
      isActive: false,
      action: () => editor?.tf?.insertText?.('\n---\n'),
      icon: <Minus className="h-4 w-4" />,
      tooltip: 'Horizontal Rule'
    },
  ]

  // Advanced formatting buttons
  const advancedFormatButtons: ButtonConfig[] = [
    {
      label: 'Superscript',
      isActive: false, // Need to implement mark check
      action: () => {
        // Simple implementation - wrap selection
        const selection = editor?.api?.getSelection?.()
        if (selection) {
          editor?.tf?.insertText?.('<sup></sup>')
        }
      },
      icon: <Superscript className="h-4 w-4" />,
      tooltip: 'Superscript'
    },
    {
      label: 'Subscript',
      isActive: false, // Need to implement mark check
      action: () => {
        const selection = editor?.api?.getSelection?.()
        if (selection) {
          editor?.tf?.insertText?.('<sub></sub>')
        }
      },
      icon: <Subscript className="h-4 w-4" />,
      tooltip: 'Subscript'
    },
    {
      label: 'Clear Formatting',
      isActive: false,
      action: () => {
        // Clear all marks
        editor?.tf?.toggleMark?.(BoldPlugin.key, false)
        editor?.tf?.toggleMark?.(ItalicPlugin.key, false)
        editor?.tf?.toggleMark?.(UnderlinePlugin.key, false)
        editor?.tf?.toggleMark?.(StrikethroughPlugin.key, false)
        editor?.tf?.toggleMark?.(CodePlugin.key, false)
      },
      icon: <RotateCcw className="h-4 w-4" />,
      tooltip: 'Clear Formatting'
    },
  ]

  // Alignment buttons
  const alignmentButtons: ButtonConfig[] = [
    {
      label: 'Align Left',
      isActive: false, // Need to implement alignment check
      action: () => {
        // For now, just add CSS class approach
        console.log('Align left clicked')
      },
      icon: <AlignLeft className="h-4 w-4" />,
      tooltip: 'Align Left'
    },
    {
      label: 'Align Center',
      isActive: false,
      action: () => {
        console.log('Align center clicked')
      },
      icon: <AlignCenter className="h-4 w-4" />,
      tooltip: 'Align Center'
    },
    {
      label: 'Align Right',
      isActive: false,
      action: () => {
        console.log('Align right clicked')
      },
      icon: <AlignRight className="h-4 w-4" />,
      tooltip: 'Align Right'
    },
    {
      label: 'Justify',
      isActive: false,
      action: () => {
        console.log('Justify clicked')
      },
      icon: <AlignJustify className="h-4 w-4" />,
      tooltip: 'Justify'
    },
  ]

  // Utility buttons
  const utilityButtons: ButtonConfig[] = [
    {
      label: 'Find & Replace',
      isActive: showSearch,
      action: () => setShowSearch(!showSearch),
      icon: <Search className="h-4 w-4" />,
      tooltip: 'Find & Replace (Ctrl+F)'
    },
    {
      label: 'Insert Special',
      isActive: showInsertMenu,
      action: () => setShowInsertMenu(!showInsertMenu),
      icon: <Hash className="h-4 w-4" />,
      tooltip: 'Insert Special Characters'
    },
  ]

  // Enhanced button rendering with tooltips and better styling
  const renderButtonGroup = (buttons: ButtonConfig[], key: string, groupClassName?: string) => (
    <div key={key} className={cn("flex gap-1", groupClassName)}>
      {buttons.map((button, index) => (
        <Button
          key={index}
          onClick={button.action}
          variant={button.isActive ? "default" : "outline"}
          size={compact ? "sm" : "sm"}
          className={cn(
            compact ? "h-7 w-7 p-1" : "h-8 w-8 p-1",
            button.className,
            theme === 'minimal' && "border-none shadow-none",
            theme === 'modern' && "rounded-md"
          )}
          title={button.tooltip || button.label}
          type="button"
          disabled={button.disabled}
        >
          {button.icon}
        </Button>
      ))}
    </div>
  )

  // Search and replace component
  const renderSearchReplace = () => (
    showSearch && (
      <div className="flex items-center gap-2 p-2 border-t bg-muted/20">
        <input
          type="text"
          placeholder="Find..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-2 py-1 text-sm border rounded w-32"
        />
        <input
          type="text"
          placeholder="Replace..."
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          className="px-2 py-1 text-sm border rounded w-32"
        />
        <Button
          size="sm"
          onClick={() => {
            // Basic find/replace implementation
            console.log('Find:', searchTerm, 'Replace:', replaceTerm)
          }}
          className="h-7"
        >
          <Replace className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowSearch(false)}
          className="h-7"
        >
          ×
        </Button>
      </div>
    )
  )

  const toolbarBaseClasses = cn(
    "flex flex-wrap items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
    compact ? "p-2" : "p-3",
    theme === 'minimal' && "border-none bg-transparent",
    theme === 'modern' && "rounded-t-lg border-border/50",
    className
  )

  return (
    <>
      <div className={cn(
        "border-b bg-background",
        className
      )}>
        {/* Scrollable toolbar container */}
        <div className="overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-600">
          <div className="flex items-center gap-2 p-3 w-max min-w-full">
          {/* Basic formatting */}
          {renderButtonGroup(formatButtons, 'format')}
        
        {!compact && <Separator orientation="vertical" className="h-6" />}
        
        {/* Block types */}
        {renderButtonGroup(blockButtons, 'blocks')}
        
        {/* Advanced blocks (only if showAdvanced) */}
        {showAdvanced && (
          <>
            {!compact && <Separator orientation="vertical" className="h-6" />}
            {renderButtonGroup(advancedBlockButtons, 'advanced-blocks')}
          </>
        )}
        
        {!compact && <Separator orientation="vertical" className="h-6" />}
        
        {/* Insert buttons */}
        {renderButtonGroup(insertButtons, 'insert')}
        
        {/* Advanced formatting (only if showAdvanced) */}
        {showAdvanced && (
          <>
            {!compact && <Separator orientation="vertical" className="h-6" />}
            {renderButtonGroup(advancedFormatButtons, 'advanced-format')}
          </>
        )}
        
        {/* Alignment (only if showAdvanced) */}
        {showAdvanced && (
          <>
            {!compact && <Separator orientation="vertical" className="h-6" />}
            {renderButtonGroup(alignmentButtons, 'alignment')}
          </>
        )}
        
        {/* Utility buttons (only if showAdvanced) */}
        {showAdvanced && (
          <>
            {!compact && <Separator orientation="vertical" className="h-6" />}
            {renderButtonGroup(utilityButtons, 'utility')}
          </>
        )}
        
          {/* Right-aligned controls */}
          <div className="ml-auto flex items-center gap-1">
            <Button
              onClick={() => editor?.undo?.()}
              variant="outline"
              size="sm"
              className={compact ? "h-7 w-7 p-1" : "h-8 w-8 p-1"}
              title="Undo (Ctrl+Z)"
              type="button"
              disabled={!editor?.api?.canUndo?.()}
            >
              <Undo className={compact ? "h-3 w-3" : "h-4 w-4"} />
            </Button>
            <Button
              onClick={() => editor?.redo?.()}
              variant="outline"
              size="sm"
              className={compact ? "h-7 w-7 p-1" : "h-8 w-8 p-1"}
              title="Redo (Ctrl+Y)"
              type="button"
              disabled={!editor?.api?.canRedo?.()}
            >
              <Redo className={compact ? "h-3 w-3" : "h-4 w-4"} />
            </Button>
          </div>
          </div>
        </div>
      </div>
      
      {/* Search and Replace Panel */}
      {renderSearchReplace()}
    </>
  )
}

// Convert HTML to simple text for now
const htmlToText = (html: string): string => {
  if (!html || html.trim() === '') {
    return ''
  }
  // Simple HTML to text conversion
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '') // Remove HTML tags
    .trim()
}

// Convert text back to HTML
const textToHtml = (text: string): string => {
  if (!text || text.trim() === '') {
    return ''
  }
  return text.replace(/\n/g, '<br>')
}

// Properly serialize Plate editor content to HTML
const serializeToHtml = (nodes: any[]): string => {
  console.log('serializeToHtml called with:', {
    nodes,
    isArray: Array.isArray(nodes),
    length: nodes?.length,
    firstNode: nodes?.[0]
  })

  if (!nodes || !Array.isArray(nodes)) {
    console.log('serializeToHtml: Invalid input, returning empty string')
    return ''
  }
  
  const result = nodes.map((node, index) => {
    console.log(`Processing node ${index}:`, node)
    
    if (!node) return ''
    
    // Handle text nodes
    if (node.text !== undefined) {
      let text = node.text
      if (node.bold) text = `<strong>${text}</strong>`
      if (node.italic) text = `<em>${text}</em>`
      if (node.underline) text = `<u>${text}</u>`
      if (node.strikethrough) text = `<del>${text}</del>`
      if (node.code) text = `<code>${text}</code>`
      console.log(`Text node processed: "${text}"`)
      return text
    }
    
    // Handle element nodes
    if (node.children && Array.isArray(node.children)) {
      const children = serializeToHtml(node.children)
      
      switch (node.type) {
        case 'p':
        case 'paragraph':
          return `<p>${children}</p>`
        case 'h1':
          return `<h1>${children}</h1>`
        case 'h2':
          return `<h2>${children}</h2>`
        case 'h3':
          return `<h3>${children}</h3>`
        case 'h4':
          return `<h4>${children}</h4>`
        case 'h5':
          return `<h5>${children}</h5>`
        case 'h6':
          return `<h6>${children}</h6>`
        case 'blockquote':
          return `<blockquote>${children}</blockquote>`
        case 'ul':
          return `<ul>${children}</ul>`
        case 'ol':
          return `<ol>${children}</ol>`
        case 'li':
          return `<li>${children}</li>`
        case 'a':
          return `<a href="${node.url || '#'}">${children}</a>`
        default:
          console.log(`Unknown node type: ${node.type}, using children: "${children}"`)
          return children
      }
    }
    
    console.log(`Node ${index} has no children or invalid structure`)
    return ''
  }).join('')

  console.log('serializeToHtml result:', result)
  return result
}

// Convert HTML back to Plate editor nodes
const htmlToNodes = (html: string): any[] => {
  if (!html || html.trim() === '') {
    return [{ type: 'p', children: [{ text: '' }] }]
  }
  
  // Handle simple cases first
  if (!html.includes('<')) {
    // Plain text - split by line breaks
    const lines = html.split('\n').filter(line => line.trim())
    if (lines.length === 0) {
      return [{ type: 'p', children: [{ text: '' }] }]
    }
    return lines.map(line => ({
      type: 'p',
      children: [{ text: line.trim() }]
    }))
  }
  
  // For HTML content, parse more carefully
  try {
    // Split by paragraph tags first
    const paragraphs = html
      .replace(/<br\s*\/?>/gi, '\n')
      .split(/<\/p>\s*<p[^>]*>/gi)
      .map(p => p.replace(/<\/?p[^>]*>/gi, '').trim())
      .filter(p => p)
    
    if (paragraphs.length === 0) {
      return [{ type: 'p', children: [{ text: '' }] }]
    }
    
    return paragraphs.map(paragraph => {
      const children = []
      let remaining = paragraph
      
      // Parse inline formatting
      const formatRegex = /<(strong|em|u|del|code)>(.*?)<\/\1>/gi
      let lastIndex = 0
      let match
      
      while ((match = formatRegex.exec(paragraph)) !== null) {
        // Add text before the formatted part
        if (match.index > lastIndex) {
          const textBefore = remaining.substring(lastIndex, match.index)
          if (textBefore) {
            children.push({ text: textBefore.replace(/<[^>]*>/g, '') })
          }
        }
        
        // Add the formatted text
        const tag = match[1]
        const text = match[2].replace(/<[^>]*>/g, '')
        const formattedNode = { text }
        
        switch (tag) {
          case 'strong':
            formattedNode.bold = true
            break
          case 'em':
            formattedNode.italic = true
            break
          case 'u':
            formattedNode.underline = true
            break
          case 'del':
            formattedNode.strikethrough = true
            break
          case 'code':
            formattedNode.code = true
            break
        }
        
        children.push(formattedNode)
        lastIndex = match.index + match[0].length
      }
      
      // Add remaining text
      if (lastIndex < paragraph.length) {
        const remainingText = paragraph.substring(lastIndex).replace(/<[^>]*>/g, '')
        if (remainingText) {
          children.push({ text: remainingText })
        }
      }
      
      // If no children were added, add empty text
      if (children.length === 0) {
        children.push({ text: paragraph.replace(/<[^>]*>/g, '') || '' })
      }
      
      return {
        type: 'p',
        children: children
      }
    })
  } catch (error) {
    console.warn('Error parsing HTML content, falling back to plain text:', error)
    // Fallback: strip all HTML and treat as single paragraph
    const plainText = html.replace(/<[^>]*>/g, '').trim()
    return [{ type: 'p', children: [{ text: plainText }] }]
  }
}

function calculateWordCount(editor: any): WordCountState {
  const text = editor?.api?.getText?.() || ''
  return { words: text.trim() ? text.trim().split(/\s+/).length : 0, characters: text.length, charactersNoSpaces: text.replace(/\s/g, '').length }
}
const useWordCount = (editor: any, onWordCountChange?: (count: number) => void) => {
  const [wordCount, setWordCount] = useState<WordCountState>(() => calculateWordCount(editor))
  const updateWordCount = useCallback(() => { setWordCount(calculateWordCount(editor)) }, [editor])
  React.useEffect(() => { onWordCountChange?.(wordCount.words) }, [wordCount.words, onWordCountChange])
  return { wordCount, updateWordCount }
}

export const PlateEditor: React.FC<PlateEditorProps> = ({
  content = '',
  placeholder = 'Start typing...',
  onChange,
  onFocus,
  onBlur,
  onSave,
  onExport,
  onWordCountChange,
  editable = true,
  className = '',
  minHeight = '200px',
  maxHeight = '400px',
  showToolbar = true,
  showAdvancedToolbar = false,
  enableSearch = false,
  enableWordCount = false,
  enableExport = false,
  compact = false,
  theme = 'default',
  borderless = false,
  toolbarClassName = '',
  id
}) => {
  // Error boundary for catching async errors
  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.warn('PlateEditor caught unhandled promise rejection:', event.reason)
      event.preventDefault() // Prevent default error handling
    }
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])
  // Generate unique ID if not provided to ensure editor isolation
  const generatedEditorId = React.useId()
  const editorId = id || generatedEditorId
  const initialValue = React.useMemo(() => {
    return htmlToNodes(content || '')
  }, [content, editorId])

  const editor = usePlateEditor({
    id: editorId, // Use unique ID for editor isolation
    plugins: [
      // Block plugins
      ParagraphPlugin,
      H1Plugin.configure({
        shortcuts: { toggle: { keys: 'mod+alt+1' } }
      }),
      H2Plugin.configure({
        shortcuts: { toggle: { keys: 'mod+alt+2' } }
      }),
      H3Plugin.configure({
        shortcuts: { toggle: { keys: 'mod+alt+3' } }
      }),
      H4Plugin.configure({
        shortcuts: { toggle: { keys: 'mod+alt+4' } }
      }),
      H5Plugin.configure({
        shortcuts: { toggle: { keys: 'mod+alt+5' } }
      }),
      H6Plugin.configure({
        shortcuts: { toggle: { keys: 'mod+alt+6' } }
      }),
      BlockquotePlugin.configure({
        shortcuts: { toggle: { keys: 'mod+shift+period' } }
      }),
      
      // Mark plugins with enhanced keyboard shortcuts
      BoldPlugin.configure({
        shortcuts: { toggle: { keys: 'mod+b' } }
      }),
      ItalicPlugin.configure({
        shortcuts: { toggle: { keys: 'mod+i' } }
      }),
      UnderlinePlugin.configure({
        shortcuts: { toggle: { keys: 'mod+u' } }
      }),
      StrikethroughPlugin.configure({
        shortcuts: { toggle: { keys: 'mod+shift+x' } }
      }),
      CodePlugin.configure({
        shortcuts: { toggle: { keys: 'mod+e' } }
      }),
    ],
    value: initialValue,
  })

  // Initialize editor debugging if needed
  React.useEffect(() => {
    if (editor) {
      console.log('🔧 Editor methods available:', {
        hasTransforms: !!editor.tf,
        tfMethods: editor.tf ? Object.keys(editor.tf) : [],
        hasApi: !!editor.api,
        apiMethods: editor.api ? Object.keys(editor.api) : [],
        editorMethods: Object.keys(editor).slice(0, 10)
      })
    }
  }, [editor])

  // Word count functionality
  const { wordCount, updateWordCount } = useWordCount(editor, onWordCountChange)

  // Enhanced content change handler with better debugging
  const handleChange = React.useCallback((newValue: any) => {
    try {
      console.log(`PlateEditor ${editorId} handleChange called:`, {
        hasOnChange: !!onChange,
        newValue: newValue,
        newValueType: typeof newValue,
        newValueLength: newValue?.length || 0,
        isArray: Array.isArray(newValue),
        hasValueProperty: newValue?.value !== undefined,
        valueIsArray: Array.isArray(newValue?.value)
      })

      if (onChange) {
        // Extract the actual editor nodes - Plate passes {editor, value} object
        let nodes = newValue
        if (newValue && typeof newValue === 'object' && newValue.value && Array.isArray(newValue.value)) {
          nodes = newValue.value
          console.log(`PlateEditor ${editorId} extracted nodes from value property:`, {
            nodesLength: nodes.length,
            firstNode: nodes[0]
          })
        } else if (Array.isArray(newValue)) {
          nodes = newValue
          console.log(`PlateEditor ${editorId} using nodes directly:`, {
            nodesLength: nodes.length
          })
        }

        if (nodes && Array.isArray(nodes)) {
          // Try multiple approaches to get content
          const html = serializeToHtml(nodes)
          const textContent = html.replace(/<[^>]*>/g, '').trim()
          
          // Alternative: try to get text directly from editor if available
          let editorText = ''
          if (newValue?.editor && typeof newValue.editor.api?.getText === 'function') {
            try {
              editorText = newValue.editor.api.getText()
              console.log(`PlateEditor ${editorId} got text from editor.api.getText():`, editorText)
            } catch (e) {
              console.log(`PlateEditor ${editorId} editor.api.getText() failed:`, e)
            }
          }
          
          console.log(`PlateEditor ${editorId} onChange (serialized):`, {
            htmlLength: html.length,
            textLength: textContent.length,
            html: html.substring(0, 100) + (html.length > 100 ? '...' : ''),
            text: textContent.substring(0, 50) + (textContent.length > 50 ? '...' : ''),
            nodesLength: nodes.length,
            hasContent: textContent.length > 0,
            actualHtml: html, // Full HTML for debugging
            editorTextLength: editorText.length,
            editorText: editorText.substring(0, 100) + (editorText.length > 100 ? '...' : '')
          })
          
          // Use whichever method got content
          const finalContent = html.trim() || (editorText ? `<p>${editorText}</p>` : '')
          console.log(`PlateEditor ${editorId} calling onChange with:`, {
            finalContent,
            method: html.trim() ? 'serialized HTML' : editorText ? 'editor text wrapped in <p>' : 'empty'
          })
          
          // Call onChange with the content
          onChange(finalContent)
          
          // Update word count after content changes
          setTimeout(() => {
            try {
              updateWordCount()
            } catch (wordCountError) {
              console.warn('Word count update error:', wordCountError)
            }
          }, 10)
        } else {
          console.log(`PlateEditor ${editorId} onChange: invalid nodes`, {
            newValue,
            extractedNodes: nodes,
            calling_onChange_with_empty_string: true
          })
          onChange('')
        }
      } else {
        console.warn(`PlateEditor ${editorId}: onChange prop not provided`)
      }
    } catch (error) {
      console.error(`PlateEditor ${editorId} handleChange error:`, error)
      // Still call onChange with empty string to prevent undefined state
      if (onChange) {
        onChange('')
      }
    }
  }, [onChange, updateWordCount, editorId])

  // Export functionality
  const handleExport = useCallback((format: 'html' | 'markdown' | 'text') => {
    if (!editor || !onExport) return

    try {
      const text = editor.api?.getText?.() || ''
      
      switch (format) {
        case 'html':
          const html = textToHtml(text)
          onExport(html, 'html')
          break
        case 'markdown':
          // Simple markdown conversion
          let markdown = text
          // Add more markdown conversion logic here
          onExport(markdown, 'markdown')
          break
        case 'text':
        default:
          onExport(text, 'text')
          break
      }
    } catch (error) {
      console.warn('Error exporting content:', error)
    }
  }, [editor, onExport])

  // Save functionality
  const handleSave = useCallback(() => {
    if (!editor || !onSave) return

    try {
      const text = editor.api?.getText?.() || ''
      const html = textToHtml(text)
      onSave(html)
    } catch (error) {
      console.warn('Error saving content:', error)
    }
  }, [editor, onSave])

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S for save
      if (e.ctrlKey && e.key === 's' && onSave) {
        e.preventDefault()
        handleSave()
      }
      // Ctrl+F for search (if enabled)
      if (e.ctrlKey && e.key === 'f' && enableSearch) {
        e.preventDefault()
        // Focus search would be handled by toolbar
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, onSave, enableSearch])

  // Update editor when content prop changes (with debouncing to prevent conflicts)
  React.useEffect(() => {
    if (editor && content !== undefined) {
      try {
        // Get current editor content as HTML
        const currentHtml = serializeToHtml(editor.children || [])
        const newContent = content || ''
        
        // Only update if content has actually changed and is significantly different
        // This prevents infinite loops from minor formatting differences
        const currentText = currentHtml.replace(/<[^>]*>/g, '').trim()
        const newText = newContent.replace(/<[^>]*>/g, '').trim()
        
        if (currentText !== newText && Math.abs(currentHtml.length - newContent.length) > 5) {
          console.log(`PlateEditor ${editorId} updating content:`, {
            currentLength: currentHtml.length,
            newLength: newContent.length,
            currentText: currentText.substring(0, 50),
            newText: newText.substring(0, 50)
          })
          
          // Convert HTML content to editor nodes and update
          const newNodes = htmlToNodes(newContent)
          
          // Use proper Plate editor setValue method with error handling
          try {
            if (editor.api?.setValue) {
              editor.api.setValue(newNodes)
            } else if (editor.tf?.setValue) {
              editor.tf.setValue(newNodes)
            } else {
              // Fallback: directly set editor children
              throw new Error('Editor content transforms unavailable')
              editor.onChange()
            }
          } catch (setValueError) {
            console.warn(`PlateEditor ${editorId} setValue error:`, setValueError)
            // Try alternative approach
            throw new Error('Editor content transforms unavailable')
            if (editor.onChange) {
              editor.onChange()
            }
          }
        }
      } catch (error) {
        console.warn(`PlateEditor ${editorId} content update error:`, error)
      }
    }
  }, [content, editor, editorId])

  if (!editor) {
    return (
      <div className="border rounded-lg p-4 bg-muted/20">
        <div className="animate-pulse">Loading editor...</div>
      </div>
    )
  }

  // Theme-based container classes
  const containerClasses = cn(
    "overflow-hidden bg-background",
    !borderless && "border rounded-lg",
    theme === 'minimal' && "border-none shadow-none",
    theme === 'modern' && "border-border/50 shadow-sm",
    className
  )

  // Editor content classes
  const editorClasses = cn(
    "plate-editor focus:outline-none prose prose-sm max-w-none",
    compact ? "p-3" : "p-4",
    theme === 'minimal' && "prose-stone",
    theme === 'modern' && "prose-slate"
  )

  // PlateEditor render
  return (
    <ErrorBoundary fallback={<div className="border rounded-lg p-4 text-destructive">Editor error: Please refresh the page</div>}>

    <div className={containerClasses}>
      {showToolbar && (
        editor ? (
          <Toolbar 
            editor={editor} 
            className={toolbarClassName}
            compact={compact}
            showAdvanced={showAdvancedToolbar}
            theme={theme}
          />
        ) : (
          // Fallback toolbar while editor loads
          <div className="flex items-center gap-2 p-3 border-b bg-background/95 backdrop-blur">
            <div className="text-sm text-muted-foreground">Loading editor toolbar...</div>
          </div>
        )
      )}
      
      <div 
        className="overflow-y-auto"
        style={{ minHeight, maxHeight }}
      >
        <Plate 
          key={editorId}
          editor={editor}
          onChange={(newValue) => {
            console.log(`🔥 Plate onChange fired for ${editorId}:`, {
              newValue,
              type: typeof newValue,
              isArray: Array.isArray(newValue),
              length: newValue?.length
            })
            handleChange(newValue)
          }}
        >
          <PlateContent
            placeholder={placeholder}
            className={editorClasses}
            onFocus={onFocus}
            onBlur={onBlur}
            readOnly={!editable}
          />
        </Plate>
      </div>
      
      {/* Bottom status bar */}
      {(enableWordCount || enableExport) && (
        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground border-t bg-muted/20">
          {enableWordCount && (
            <div className="flex items-center gap-4">
              <span>Words: {wordCount.words}</span>
              <span>Characters: {wordCount.characters}</span>
              <span>Characters (no spaces): {wordCount.charactersNoSpaces}</span>
            </div>
          )}
          
          {enableExport && (
            <div className="flex items-center gap-2">
              {onSave && (
                <Button
                  onClick={handleSave}
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Save
                </Button>
              )}
              {onExport && (
                <>
                  <Button
                    onClick={() => handleExport('html')}
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    HTML
                  </Button>
                  <Button
                    onClick={() => handleExport('markdown')}
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    MD
                  </Button>
                  <Button
                    onClick={() => handleExport('text')}
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    TXT
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
      </ErrorBoundary>
  )
}

export default PlateEditor
