import { AppError } from '../errors/AppError';

// Phase 20 — AI Assistant. Two real, non-fake providers:
//
// 1. Ollama (free, local, self-hosted) — genuinely free and fast: it runs
//    on your own server with no per-request cost and no external API key,
//    using an open-source model (default: llama3.2:3b — a small, fast
//    model with accuracy that's plenty for CRM summaries/chat; swap in
//    llama3.2:1b for an even lighter footprint, or llama3.1 for higher
//    quality at the cost of speed). This is the "faster and free" option.
//    `docker compose up` starts Ollama automatically (see docker-compose.yml);
//    for a bare-metal deploy see backend/.env.production.example for setup.
// 2. Anthropic's API (paid, requires ANTHROPIC_API_KEY) — higher quality,
//    costs per request. Used as a fallback if Ollama isn't configured.
//
// Whichever is configured is used for real — if neither is, every function
// here throws AIConfigError instead of returning a canned/fake response.

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

// ── Concurrency control ─────────────────────────────────────────────────────
// A local Ollama instance runs on the same CPU as everything else on the
// server, so it can't actually run unlimited requests in parallel — without
// a cap here, 10 people clicking "Summarize" at once would all sit in
// Ollama's internal queue until nginx's proxy_read_timeout gives up and
// returns its own HTML error page (the "non-JSON response" you saw). These
// two settings turn that into a fast, clear JSON error instead:
//   AI_MAX_CONCURRENT     — requests actually sent to the provider at once.
//                           Keep this at or below Ollama's OLLAMA_NUM_PARALLEL
//                           (see docker-compose.yml) so requests don't queue
//                           twice. Default 4 is reasonable for a 2-4 vCPU box.
//   AI_QUEUE_WAIT_MS      — how long an extra request waits for a free slot
//                           before failing fast with "AI Assistant is busy".
//   AI_REQUEST_TIMEOUT_MS — hard cap per request to the provider itself, so a
//                           stuck one can't hold its slot (and the whole
//                           queue behind it) forever.
const MAX_CONCURRENT = Math.max(1, parseInt(process.env.AI_MAX_CONCURRENT || '4', 10) || 4);
const QUEUE_WAIT_MS = Math.max(0, parseInt(process.env.AI_QUEUE_WAIT_MS || '20000', 10) || 20000);
const REQUEST_TIMEOUT_MS = Math.max(1000, parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '45000', 10) || 45000);

let activeRequests = 0;
const waitQueue: Array<() => void> = [];

/** Waits for a free concurrency slot (or throws AIBusyError if the queue doesn't clear in time). Always pair with the returned release() in a finally block. */
async function acquireSlot(): Promise<() => void> {
  const release = () => {
    activeRequests--;
    const next = waitQueue.shift();
    if (next) next();
  };

  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return release;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waitQueue.indexOf(onTurn);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new AIBusyError());
    }, QUEUE_WAIT_MS);
    const onTurn = () => {
      clearTimeout(timer);
      resolve();
    };
    waitQueue.push(onTurn);
  });
  activeRequests++;
  return release;
}

type AIProvider = 'ollama' | 'anthropic' | null;

const isOllamaConfigured = (): boolean => !!process.env.OLLAMA_BASE_URL || process.env.AI_PROVIDER === 'ollama';
const isAnthropicConfigured = (): boolean => !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim() !== '';

/** Which provider will actually be used, or null if neither is configured. Ollama (free) wins if both are set, unless AI_PROVIDER explicitly says otherwise. */
export const getActiveProvider = (): AIProvider => {
  if (process.env.AI_PROVIDER === 'anthropic' && isAnthropicConfigured()) return 'anthropic';
  if (process.env.AI_PROVIDER === 'ollama' && isOllamaConfigured()) return 'ollama';
  if (isOllamaConfigured()) return 'ollama';
  if (isAnthropicConfigured()) return 'anthropic';
  return null;
};

export class AIConfigError extends AppError {
  constructor() {
    super(
      "AI Assistant isn't configured — set OLLAMA_BASE_URL (free, local) or ANTHROPIC_API_KEY (paid) on the server.",
      400
    );
    this.name = 'AIConfigError';
  }
}

/** Every concurrency slot is in use and the queue didn't clear within AI_QUEUE_WAIT_MS. 503 so the frontend can show "try again shortly" instead of a raw timeout. */
export class AIBusyError extends AppError {
  constructor() {
    super('The AI Assistant is handling a lot of requests right now — please try again in a few seconds.', 503);
    this.name = 'AIBusyError';
  }
}

/** The provider itself didn't respond within AI_REQUEST_TIMEOUT_MS. 504 (matches the semantics, even though we're the ones returning it as clean JSON instead of letting nginx do it as HTML). */
export class AITimeoutError extends AppError {
  constructor() {
    super('The AI Assistant took too long to respond. Please try again — if this keeps happening, a smaller/faster model or more server resources may help.', 504);
    this.name = 'AITimeoutError';
  }
}

export const isAIConfigured = (): boolean => getActiveProvider() !== null;

interface CallOptions {
  system?: string;
  maxTokens?: number;
}

async function callOllama(userPrompt: string, options: CallOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        // Keep the model resident in memory between requests — reloading it
        // from disk on every call is a major source of slow first-responses
        // under load. Matches OLLAMA_KEEP_ALIVE on the ollama service itself.
        keep_alive: '30m',
        messages: [
          ...(options.system ? [{ role: 'system', content: options.system }] : []),
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new AITimeoutError();
    throw new Error(
      `Could not reach Ollama at ${OLLAMA_BASE_URL}. If you're running via docker compose it should start automatically — check \`docker compose logs ollama\`. For a bare-metal install: curl -fsSL https://ollama.com/install.sh | sh && ollama pull ${OLLAMA_MODEL}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data: any = await response.json();
  const text = (data?.message?.content || '').trim();
  if (!text) throw new Error('Ollama returned an empty response.');
  return text;
}

async function callAnthropic(userPrompt: string, options: CallOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: options.maxTokens || 400,
        ...(options.system ? { system: options.system } : {}),
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new AITimeoutError();
    throw new Error('Could not reach the AI service. Check network access to api.anthropic.com.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data: any = await response.json();
  const text = (data.content || [])
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('AI returned an empty response.');
  return text;
}

/** Dispatches to whichever provider is actually configured, behind the concurrency limiter above. */
async function callClaude(userPrompt: string, options: CallOptions = {}): Promise<string> {
  const provider = getActiveProvider();
  if (!provider) throw new AIConfigError();

  const release = await acquireSlot();
  try {
    return await (provider === 'ollama' ? callOllama(userPrompt, options) : callAnthropic(userPrompt, options));
  } finally {
    release();
  }
}

const SYSTEM_PROMPT =
  'You are a CRM sales assistant. Be concise and concrete. Only use the facts given to you in the prompt — never invent customer names, numbers, dates, or history that were not provided.';

/** Splits a "<summary>\nNext action: <action>" response into its two parts. */
function splitSummaryAndAction(text: string): { summary: string; nextAction: string | null } {
  const match = text.match(/next action:\s*(.+)$/is);
  if (!match) return { summary: text, nextAction: null };
  const nextAction = match[1].trim();
  const summary = text.slice(0, match.index).trim();
  return { summary, nextAction };
}

export async function summarizeDeal(deal: any, timelineLines: string[], currencySymbol: string) {
  const prompt = [
    `Deal: ${deal.title}`,
    `Client: ${deal.client}`,
    `Stage: ${deal.stage}`,
    `Value: ${currencySymbol}${deal.value}`,
    `Expected close: ${deal.expectedCloseDate || 'not set'}`,
    deal.nextStep ? `Logged next step: ${deal.nextStep}` : null,
    '',
    'Recent activity:',
    timelineLines.length ? timelineLines.join('\n') : 'No activity logged yet.',
    '',
    'In 2-3 sentences, summarize where this deal stands right now. Then on a new line write "Next action:" followed by ONE concrete, specific next step.',
  ]
    .filter(Boolean)
    .join('\n');

  const text = await callClaude(prompt, { system: SYSTEM_PROMPT, maxTokens: 300 });
  return splitSummaryAndAction(text);
}

export async function summarizeLead(lead: any, timelineLines: string[]) {
  const prompt = [
    `Lead: ${lead.firstName} ${lead.lastName}${lead.company ? ` at ${lead.company}` : ''}`,
    `Status: ${lead.status}`,
    `Source: ${lead.leadSource}`,
    lead.jobTitle ? `Job title: ${lead.jobTitle}` : null,
    lead.industry ? `Industry: ${lead.industry}` : null,
    '',
    'Recent activity:',
    timelineLines.length ? timelineLines.join('\n') : 'No activity logged yet.',
    '',
    'In 2-3 sentences, summarize where this lead stands right now. Then on a new line write "Next action:" followed by ONE concrete, specific next step to move it forward.',
  ]
    .filter(Boolean)
    .join('\n');

  const text = await callClaude(prompt, { system: SYSTEM_PROMPT, maxTokens: 300 });
  return splitSummaryAndAction(text);
}

export async function generateQuoteFollowUp(quote: any, companyName: string, currencySymbol: string) {
  const prompt = [
    `Write a short, warm, professional follow-up message to send a customer about an open quotation.`,
    `Customer: ${quote.client}`,
    `Quote number: ${quote.quoteNumber}`,
    `Quote value: ${currencySymbol}${quote.amount}`,
    `Quote status: ${quote.status}`,
    `From company: ${companyName}`,
    '',
    'Keep it under 80 words, plain text (no markdown), no subject line, no placeholders in curly braces — write it as a finished message ready to send.',
  ].join('\n');

  return callClaude(prompt, { system: SYSTEM_PROMPT, maxTokens: 200 });
}

/**
 * Item 9 — general chat widget. Grounded only in the real, aggregate CRM
 * snapshot passed in by the caller (see aiController.buildCrmSnapshot) —
 * the system prompt explicitly tells the model it does NOT have access to
 * individual records, only these counts, so it doesn't invent specific
 * names/numbers beyond what's actually provided.
 */
export async function chatReply(message: string, history: { role: 'user' | 'assistant'; text: string }[], snapshotContext: string) {
  const system = [
    'You are the AI assistant embedded in a CRM application. Answer helpfully and concisely (a few sentences unless more detail is truly needed).',
    'You have this real, current snapshot of the CRM — use it when relevant:',
    snapshotContext,
    'You do NOT have access to individual lead/deal/contact records beyond this snapshot — if the question needs that level of detail, say so plainly and suggest where in the app to look, rather than inventing specific names or numbers.',
  ].join('\n');

  const conversation = history
    .slice(-8)
    .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`)
    .join('\n');

  const prompt = conversation ? `${conversation}\nUser: ${message}` : message;
  return callClaude(prompt, { system, maxTokens: 500 });
}
