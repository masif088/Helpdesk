'use client'

import { Input } from 'antd'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef,useState } from 'react'

import { useTheme } from '@/components/providers/ThemeProvider'
import { linkifyRichHtml } from '@/lib/linkify-rich-html'
import { uploadTicketImage } from '@/utils/storage'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

import 'react-quill-new/dist/quill.snow.css'

/** Full editor from ReactQuill / toolbar `this.quill` (not the read-only unprivileged proxy). */
type QuillFullEditor = {
  getSelection: (focus?: boolean) => { index: number; length?: number } | null
  getLength: () => number
  insertEmbed: (index: number, type: string, value: string | boolean, source?: string) => void
  setSelection: (index: number, length?: number, source?: string) => void
  focus: () => void
}

type QuillEditor = {
  getSelection: (focus: boolean) => { index: number } | null
  getLength: () => number
  insertEmbed: (index: number, type: string, value: string | boolean, source?: string) => void
  setSelection: (index: number, length?: number, source?: string) => void
}

const QUILL_FORMATS = [
  'header',
  'size',
  'color',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  /** Enables Tab / Shift+Tab to create sub-bullets and sub-numbering inside lists */
  'indent',
  'link',
  'image',
  /** Custom blot from `registerCommentWysiwygQuill()` — must be whitelisted or embed is stripped */
  'divider',
  /** Soft line break blot — Shift+Enter; renders as <br> within the same <p> */
  'linebreak',
]

interface CommentWysiwygProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  height?: string
  bgColor?: string
  /** Ticket/todo id for image upload path: ticket/{ticketId}/{unixtime}. Omit for draft path (ticket/draft/...). */
  ticketId?: string | number
  /**
   * When true, uses Quill `getSemanticHTML()` (normalizes HTML; consecutive empty paragraphs often collapse).
   * When false (default), uses `innerHTML` so double Enter / multiple blank lines are preserved.
   * Message templates keep `false` so `{{ placeholders }}` stay literal.
   */
  useSemanticHTML?: boolean
  /** Auto-link http(s) URLs on paste and blur (default true). */
  autoLinkify?: boolean
  /** Focus the editor immediately after it mounts (default false). */
  autoFocus?: boolean
  /** Remove Quill toolbar/container borders (use when wrapped in an outer bordered container). */
  noBorder?: boolean
}

export default function CommentWysiwyg({
  value = '',
  onChange,
  placeholder = 'Add a comment...',
  height = '100px',
  bgColor = 'transparent',
  ticketId,
  useSemanticHTML = false,
  autoLinkify = true,
  autoFocus = false,
  noBorder = false,
}: CommentWysiwygProps) {
  const { resolved } = useTheme()
  const [mounted, setMounted] = useState(false)
  /** Remount Quill when blank → HTML is applied externally (template); avoids tags showing as plain text. */
  const [quillEpoch, setQuillEpoch] = useState(0)
  const quillRef = useRef<{ getEditor: () => QuillEditor } | null>(null)
  const normalizedPlainTextForQuillRef = useRef(false)
  const prevValueForEpochRef = useRef(value)
  /** True when the latest value change came from typing inside Quill — must NOT trigger a remount (would drop focus). */
  const changeFromEditorRef = useRef(false)
  const ticketIdRef = useRef(ticketId)
  ticketIdRef.current = ticketId
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)
  const autoLinkifyRef = useRef(autoLinkify)
  onChangeRef.current = onChange
  valueRef.current = value
  autoLinkifyRef.current = autoLinkify

  const isBlankEditorValue = (v: string): boolean => {
    const textOnly = String(v || '')
      .replace(/<p><br><\/p>/gi, '')
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
    return textOnly.length === 0
  }

  const valueLooksLikeHtml = /<[a-z][\s\S]*>/i.test(value ?? '')

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        [{ size: ['small', false, 'large', 'huge'] }],
        [{ color: [] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }, { indent: '-1' }, { indent: '+1' }],
        ['link', 'image'],
        ['divider'],
        ['clean'],
      ],
      handlers: {
        /** Toolbar calls `handler.call(toolbarModule, value)` — use `this.quill` (reliable; ref spread can miss). */
        divider: function dividerHandler(this: { quill: QuillFullEditor }) {
          const quill = this.quill
          const range = quill.getSelection(true)
          const index = range?.index ?? Math.max(0, quill.getLength() - 1)
          quill.insertEmbed(index, 'divider', true, 'user')
          quill.setSelection(index + 1, 0, 'user')
        },
        image: function imageHandler(this: { quill: QuillFullEditor }) {
          const quill = this.quill
          const input = document.createElement('input')
          input.setAttribute('type', 'file')
          input.setAttribute('accept', 'image/*')
          input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            const { url, error } = await uploadTicketImage(file, ticketIdRef.current ?? undefined)
            if (error || !url) {
              console.error('Image upload failed:', error)
              return
            }
            const range = quill.getSelection(true)
            const idx = range?.index ?? Math.max(0, quill.getLength() - 1)
            quill.insertEmbed(idx, 'image', url, 'user')
            quill.setSelection(idx + 1, 0, 'user')
          }
          input.click()
        },
      },
    },
    keyboard: {
      bindings: {
        /** Tab inside a list item → indent (sub-bullet / sub-numbering). */
        listTab: {
          key: 'Tab',
           
          handler(this: { quill: any }, range: unknown, context: { format?: { list?: unknown } }) {
            if (context.format?.list) {
              this.quill.format('indent', '+1', 'user')
              return false
            }
            return true
          },
        },
        /** Shift+Tab inside a list item → un-indent. */
        listShiftTab: {
          key: 'Tab',
          shiftKey: true,
           
          handler(this: { quill: any }, range: unknown, context: { format?: { list?: unknown } }) {
            if (context.format?.list) {
              this.quill.format('indent', '-1', 'user')
              return false
            }
            return true
          },
        },
        /**
         * Shift+Enter: insert a linebreak blot (<br> within the same <p>),
         * visually distinct from Enter which creates a new <p> paragraph.
         */
        shiftEnter: {
          key: 'Enter',
          shiftKey: true,
          handler(this: { quill: { getSelection: (f: boolean) => { index: number; length: number } | null; insertEmbed: (i: number, t: string, v: unknown, s: string) => void; setSelection: (i: number, l: number, s: string) => void } }) {
            const range = this.quill.getSelection(true)
            if (!range) return true
            this.quill.insertEmbed(range.index, 'linebreak', true, 'user')
            this.quill.setSelection(range.index + 1, 0, 'user')
            return false
          },
        },
      },
    },
  }), [])

  useEffect(() => {
    import('@/lib/comment-wysiwyg-quill-register').then(({ registerCommentWysiwygQuill }) => {
      registerCommentWysiwygQuill()
      setMounted(true)
    })
  }, [])

  useEffect(() => {
    if (!mounted || !autoFocus) return
    const t = window.setTimeout(() => {
      const editor = quillRef.current?.getEditor() as (QuillEditor & { focus?: () => void }) | undefined
      editor?.focus?.()
    }, 50)
    return () => window.clearTimeout(t)
  }, [mounted, autoFocus])

  /** After paste, linkify bare URLs in the editor HTML. */
  useEffect(() => {
    if (!mounted || !autoLinkify) return

    let root: HTMLElement | null = null
    let onPaste: (() => void) | null = null

    const attach = () => {
      const editor = quillRef.current?.getEditor() as (QuillEditor & { root?: HTMLElement }) | undefined
      const el = editor?.root ?? null
      if (!el || el === root) return
      if (root && onPaste) root.removeEventListener('paste', onPaste)
      root = el
      onPaste = () => {
        requestAnimationFrame(() => {
          if (!autoLinkifyRef.current || !onChangeRef.current || !root) return
          const current = root.innerHTML
          const linked = linkifyRichHtml(current)
          if (linked !== current) onChangeRef.current(linked)
        })
      }
      root.addEventListener('paste', onPaste)
    }

    attach()
    const t = window.setTimeout(attach, 50)
    return () => {
      window.clearTimeout(t)
      if (root && onPaste) root.removeEventListener('paste', onPaste)
    }
  }, [mounted, autoLinkify, quillEpoch])

  const applyAutoLinkify = () => {
    if (!autoLinkify || !onChange) return
    const linked = linkifyRichHtml(value ?? '')
    if (linked !== (value ?? '')) onChange(linked)
  }

  useEffect(() => {
    normalizedPlainTextForQuillRef.current = false
  }, [ticketId])

  /** Remount Quill when parent injects HTML into a blank editor (agent reply template, mode switch).
   * Skip when the change originated from typing in the editor itself — remounting would steal focus. */
  useEffect(() => {
    const prev = prevValueForEpochRef.current ?? ''
    prevValueForEpochRef.current = value ?? ''
    const fromEditor = changeFromEditorRef.current
    changeFromEditorRef.current = false
    if (!mounted || fromEditor) return
    if (isBlankEditorValue(prev) && !isBlankEditorValue(value ?? '') && /<[a-z][\s\S]*>/i.test(value ?? '')) {
      setQuillEpoch((e) => e + 1)
    }
  }, [mounted, value])

  /** After swap to Quill, turn multiline plain text (from fallback textarea) into <p> HTML once. */
  useEffect(() => {
    if (!mounted || !onChange || normalizedPlainTextForQuillRef.current) return
    const v = value ?? ''
    if (!v.includes('\n')) return
    if (/<[a-z][\s\S]*>/i.test(v)) return
    normalizedPlainTextForQuillRef.current = true
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = v
      .split('\n')
      .map((line) => `<p>${line ? esc(line) : '<br>'}</p>`)
      .join('')
    onChange(html)
  }, [mounted, value, onChange])

  const editorMinPx = useMemo(() => {
    if (!height) return 99
    const n = parseInt(String(height).replace('px', ''), 10)
    return Number.isFinite(n) ? Math.max(40, n - 1) : 99
  }, [height])

  // Editable fallback until ReactQuill loads (Enter / plain-text bullets work here).
  // Never put HTML template strings into the plain textarea — they show as raw tags.
  if (!mounted) {
    const parsed = height ? parseInt(height.replace('px', ''), 10) : NaN
    const minH = Number.isFinite(parsed) ? parsed : 200
    if (valueLooksLikeHtml) {
      return (
        <div
          className="comment-wysiwyg-wrapper"
          style={{
            marginBottom: 8,
            minHeight: minH,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            background: '#fff',
          }}
          suppressHydrationWarning
        >
          Loading editor…
        </div>
      )
    }
    return (
      <div className="comment-wysiwyg-wrapper" style={{ marginBottom: 8 }} suppressHydrationWarning>
        <Input.TextArea
          placeholder={`${placeholder} (Enter for new lines; use - or * for bullet lines)`}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          rows={Math.max(4, Math.round(minH / 24))}
          style={{
            minHeight: minH,
            resize: 'vertical',
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
          }}
        />
      </div>
    )
  }

  const shellBg = resolved === 'dark' ? 'transparent' : bgColor

  const quillProps = {
    theme: 'snow',
    value,
    onChange: (v: string) => {
      changeFromEditorRef.current = true
      onChange?.(v)
    },
    onBlur: applyAutoLinkify,
    placeholder,
    modules,
    formats: QUILL_FORMATS,
    style: { backgroundColor: shellBg, height: '100%' },
    ref: quillRef,
    tabIndex: 10,
    useSemanticHTML,
  }
  return (
    <>
    <style>{`
      .comment-wysiwyg-wrapper {
        position: relative;
        resize: vertical;
        overflow: hidden;
      }
      .comment-wysiwyg-wrapper .quill {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .comment-wysiwyg-wrapper .ql-container {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }
      .comment-wysiwyg-wrapper .ql-editor {
        min-height: ${editorMinPx}px;
        box-sizing: border-box;
      }
      /* Paragraph gap in editor: Enter creates new <p> (visible gap), Shift+Enter stays in same <p> (tight br) */
      .comment-wysiwyg-wrapper .ql-editor p + p {
        margin-top: 10px !important;
      }
      /* Toolbar: size / color pickers need room; dropdowns above sibling controls */
      .comment-wysiwyg-wrapper .ql-toolbar.ql-snow {
        flex-wrap: wrap;
        row-gap: 4px;
      }
      .comment-wysiwyg-wrapper .ql-snow .ql-picker.ql-size {
        width: 92px;
      }
      .comment-wysiwyg-wrapper .ql-snow .ql-picker.ql-header {
        width: 108px;
      }
      /* Snow theme ships .ql-size-* on spans; reinforce in composer if theme order loads late */
      .comment-wysiwyg-wrapper .ql-editor .ql-size-small {
        font-size: 0.75em;
      }
      .comment-wysiwyg-wrapper .ql-editor .ql-size-large {
        font-size: 1.5em;
      }
      .comment-wysiwyg-wrapper .ql-editor .ql-size-huge {
        font-size: 2.5em;
      }
      .comment-wysiwyg-wrapper .ql-editor hr {
        border: none;
        border-top: 1px solid rgba(0, 0, 0, 0.12);
        margin: 0.75em 0;
        height: 0;
        padding: 0;
      }
      .comment-wysiwyg-wrapper .ql-toolbar button.ql-divider {
        width: 28px;
      }
      .comment-wysiwyg-wrapper .ql-toolbar button.ql-divider svg {
        width: 18px;
        height: 18px;
      }
      ${noBorder ? `
      .comment-wysiwyg-wrapper .ql-toolbar.ql-snow,
      .comment-wysiwyg-wrapper .ql-container.ql-snow {
        border-color: transparent;
      }
      ` : ''}
    `}</style>

    <div className="comment-wysiwyg-wrapper" style={{ marginBottom: 8, height: height, minHeight: editorMinPx + 42, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* key remounts Quill when HTML is injected into a blank editor; react-quill-new types omit ref */}
      <ReactQuill key={quillEpoch} {...(quillProps as React.ComponentProps<typeof ReactQuill>)} />
    </div>
    </>
  )
}
