'use client'

/**
 * Registers Quill formats used only by ticket comment WYSIWYG (divider blot, linebreak blot, toolbar icon).
 * Must run on the client before the first ReactQuill instance mounts.
 */
import Quill from 'quill'
import { BlockEmbed } from 'quill/blots/block.js'
 
const EmbedBlot = Quill.import('blots/embed') as any

const DIVIDER_ICON =
  '<svg viewBox="0 0 18 18" aria-hidden="true"><line class="ql-stroke" x1="3" x2="15" y1="9" y2="9"/></svg>'

class DividerBlot extends BlockEmbed {
  static blotName = 'divider'
  static tagName = 'hr'

  static create() {
    return super.create(true) as HTMLElement
  }

  static value() {
    return true
  }
}

/** Inline soft line break — Shift+Enter inserts this; renders as <br> within the same <p>. */
class LineBreakBlot extends EmbedBlot {
  static blotName = 'linebreak'
  static tagName = 'br'

  static create() {
    return document.createElement('br')
  }

  static value() {
    return true
  }

   
  optimize(context: any) {
    // Prevent Quill from merging this blot with adjacent text
    super.optimize(context)
  }
}

let didRegister = false

export function registerCommentWysiwygQuill(): void {
  if (typeof window === 'undefined' || didRegister) return
  didRegister = true
  Quill.register(DividerBlot, true)
  Quill.register(LineBreakBlot, true)
  const icons = Quill.import('ui/icons') as Record<string, unknown>
  ;(icons as Record<string, string>).divider = DIVIDER_ICON
}
