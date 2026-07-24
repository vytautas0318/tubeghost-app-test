// Isolated Gemini client for the global in-app assistant. Its own module so the
// provider/model can be swapped without touching the request handler.
//
// Non-streaming generateContent, multi-turn (accepts a contents array). API key
// lives ONLY as the GEMINI_API_KEY edge secret — never shipped to the renderer.

// GA/stable. `-preview` variants are shut down — do not use. Swap to change model.
export const GEMINI_MODEL = 'gemini-3.1-flash-lite'

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

// One turn of the conversation as Gemini expects it.
export interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

export interface GeminiCallOptions {
  system: string
  contents: GeminiContent[]
  thinkingLevel?: string
  // When set, forces structured JSON output against this schema.
  responseSchema?: unknown
}

export async function callGemini(apiKey: string, opts: GeminiCallOptions): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: {
      // thinkingLevel MUST be nested under thinkingConfig — the v1beta REST API
      // rejects it at the top of generationConfig ("Unknown name thinkingLevel").
      thinkingConfig: { thinkingLevel: opts.thinkingLevel ?? 'low' },
      ...(opts.responseSchema
        ? { responseMimeType: 'application/json', responseSchema: opts.responseSchema }
        : {})
    }
  }

  let res: Response
  try {
    res = await fetch(ENDPOINT(GEMINI_MODEL, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch (e) {
    throw new Error(`Could not reach the AI service: ${(e as Error).message}`)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const err = await res.json()
      detail = err?.error?.message ?? ''
    } catch {
      /* body not JSON */
    }
    if (res.status === 429) throw new Error('The assistant is rate-limited right now. Try again shortly.')
    throw new Error(`AI service error (${res.status})${detail ? `: ${detail}` : ''}`)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new Error('The assistant returned an unreadable response.')
  }

  const text = extractText(json)
  if (!text) {
    const reason = blockReason(json)
    throw new Error(reason ? `The assistant declined to respond (${reason}).` : 'The assistant returned an empty response.')
  }
  return text
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
  promptFeedback?: { blockReason?: string }
}

function extractText(json: unknown): string {
  const parts = (json as GeminiResponse)?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => p?.text ?? '')
    .join('')
    .trim()
}

function blockReason(json: unknown): string | null {
  const r = json as GeminiResponse
  return r?.promptFeedback?.blockReason ?? r?.candidates?.[0]?.finishReason ?? null
}
