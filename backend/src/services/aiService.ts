import { AppError } from '../errors/AppError';

// Phase 20 — AI Assistant. Real calls to the Anthropic API, gated behind
// ANTHROPIC_API_KEY exactly like every other integration in this project
// (see integrationController.ts): if the key isn't set, every function here
// throws AIConfigError instead of returning a canned/fake response. Nothing
// in this file ever fabricates an AI answer.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

export class AIConfigError extends AppError {
  constructor() {
    super("AI Assistant isn't configured — set ANTHROPIC_API_KEY on the server.", 400);
    this.name = 'AIConfigError';
  }
}

export const isAIConfigured = (): boolean => !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim() !== '';

interface CallOptions {
  system?: string;
  maxTokens?: number;
}

/** Low-level call to the Anthropic Messages API. */
async function callClaude(userPrompt: string, options: CallOptions = {}): Promise<string> {
  if (!isAIConfigured()) throw new AIConfigError();

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
        model: DEFAULT_MODEL,
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
