import { AppError } from '../errors/AppError';

// Phase 20 — AI Assistant. Two real, non-fake providers:
//
// 1. Ollama (free, local, self-hosted) — genuinely free and fast: it runs
//    on your own server with no per-request cost and no external API key,
//    using an open-source model (default: llama3.1). This is the "faster
//    and free" option. It requires Ollama actually installed and running on
//    the backend server — see backend/.env.production.example for setup.
// 2. Anthropic's API (paid, requires ANTHROPIC_API_KEY) — higher quality,
//    costs per request. Used as a fallback if Ollama isn't configured.
//
// Whichever is configured is used for real — if neither is, every function
// here throws AIConfigError instead of returning a canned/fake response.

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

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

export const isAIConfigured = (): boolean => getActiveProvider() !== null;

interface CallOptions {
  system?: string;
  maxTokens?: number;
}

async function callOllama(userPrompt: string, options: CallOptions): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          ...(options.system ? [{ role: 'system', content: options.system }] : []),
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${OLLAMA_BASE_URL}. Is it installed and running on this server? (curl -fsSL https://ollama.com/install.sh | sh && ollama pull ${OLLAMA_MODEL})`
    );
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
  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: options.maxTokens || 400,
        ...(options.system ? { system: options.system } : {}),
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (err) {
    throw new Error('Could not reach the AI service. Check network access to api.anthropic.com.');
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

/** Dispatches to whichever provider is actually configured. */
async function callClaude(userPrompt: string, options: CallOptions = {}): Promise<string> {
  const provider = getActiveProvider();
  if (!provider) throw new AIConfigError();
  return provider === 'ollama' ? callOllama(userPrompt, options) : callAnthropic(userPrompt, options);
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
