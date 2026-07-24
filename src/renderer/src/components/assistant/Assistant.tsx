// Global in-app assistant. A rounded, draggable floating button (default
// bottom-right) mounted once in the authenticated app shell so it's reachable
// from every page. Click opens a chat popover; drag repositions the button.
// Agentic: it answers questions AND can perform actions — but only after the
// user approves the proposed plan (see PlanCard).

import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, Sparkles, PenLine } from 'lucide-react'
import { useAssistant, type AssistantMessage } from './useAssistant'
import { MODEL_OPTIONS, type ModelChoice } from '@/lib/assistant'
import { useDraggableFab } from './useDraggableFab'
import { PlanCard } from './PlanCard'

const GREETING =
  'Hi! I’m the TubeGhost assistant. Ask me anything about the app — or ask me to create, launch, or manage profiles for you (I’ll confirm before doing anything).'

function Bubble({
  m,
  onApprove,
  onCancel
}: {
  m: AssistantMessage
  onApprove: (id: string) => void
  onCancel: (id: string) => void
}): React.ReactElement {
  if (m.plan) {
    return (
      <PlanCard
        plan={m.plan}
        status={m.planStatus ?? 'pending'}
        results={m.results}
        onApprove={() => onApprove(m.id)}
        onCancel={() => onCancel(m.id)}
      />
    )
  }
  return (
    <div className={`as-msg as-msg-${m.role}`}>
      <div className="as-bubble">
        {(m.text ?? '').split('\n').map((line, i) => (
          <p key={i} className="as-line">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

// The FAB glyph: a "magic" sparkle-badged chat mark at rest that morphs into a
// compose (pen) mark on hover — signalling "write me a message".
function FabIcon({ hover }: { hover: boolean }): React.ReactElement {
  if (hover) return <PenLine size={22} />
  return (
    <span className="as-fab-magic">
      <Sparkles size={22} fill="currentColor" strokeWidth={0} />
    </span>
  )
}

export function Assistant(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const { messages, busy, model, setModel, send, approvePlan, cancelPlan } = useAssistant()
  const [input, setInput] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { pos, dragging, onPointerDown, onClick } = useDraggableFab(() => setOpen((v) => !v))

  useEffect(() => {
    if (open) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [messages, busy, open])

  // Focus the input when the panel opens, and keep it focused after a reply
  // lands (busy → false) so the user can keep typing without re-clicking.
  useEffect(() => {
    if (open && !busy) inputRef.current?.focus()
  }, [open, busy])

  const submit = (): void => {
    if (!input.trim() || busy) return
    void send(input)
    setInput('')
    inputRef.current?.focus() // keep the cursor in the box after sending
  }

  // Panel anchors just above the FAB, clamped so it never runs off the top.
  const panelBottom = Math.min(pos.bottom + 68, window.innerHeight - 40)
  const panelRight = Math.min(pos.right, window.innerWidth - 400)

  return (
    <>
      {open && (
        <div
          className="as-panel"
          style={{ right: Math.max(8, panelRight), bottom: panelBottom }}
          role="dialog"
          aria-label="TubeGhost assistant"
        >
          <div className="as-head">
            <div className="as-head-title">
              <Sparkles size={15} />
              <span>TubeGhost Assistant</span>
            </div>
            <div className="as-head-actions">
              <select
                className="as-model"
                value={model}
                onChange={(e) => setModel(e.target.value as ModelChoice)}
                aria-label="Assistant model"
                title="Choose the assistant model"
              >
                {MODEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button className="as-x" onClick={() => setOpen(false)} aria-label="Close assistant">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="as-body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="as-msg as-msg-assistant">
                <div className="as-bubble">{GREETING}</div>
              </div>
            )}
            {messages.map((m) => (
              <Bubble
                key={m.id}
                m={m}
                onApprove={(id) => void approvePlan(id)}
                onCancel={cancelPlan}
              />
            ))}
            {busy && (
              <div className="as-msg as-msg-assistant">
                <div className="as-bubble as-thinking">
                  <Loader2 size={14} className="spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          <div className="as-composer">
            <textarea
              ref={inputRef}
              className="as-input"
              placeholder={busy ? 'Waiting for a reply…' : 'Ask a question…'}
              value={input}
              rows={1}
              // Intentionally NOT disabled while busy — a disabled textarea loses
              // focus. submit() already blocks sending until the reply lands.
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <button
              className="as-send"
              disabled={busy || !input.trim()}
              onClick={submit}
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <button
        className={`as-fab${open ? ' as-fab-open' : ''}${dragging ? ' as-fab-dragging' : ''}`}
        style={{ right: pos.right, bottom: pos.bottom }}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        title="TubeGhost Assistant — drag to move"
      >
        {open ? <X size={22} /> : <FabIcon hover={hover && !dragging} />}
      </button>
    </>
  )
}
