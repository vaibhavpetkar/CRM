import type { CallStatus } from '../../models/Call';

/**
 * A telephony provider the CRM can place click-to-call calls through.
 *
 * Indian rules (TRAI/DoT) don't let an internet app call a phone number
 * directly, so every provider here uses the "bridge" model: the provider
 * rings the CRM user's own phone first, and when they pick up it dials the
 * customer from the company's virtual number and records both sides. To add
 * a provider (Plivo, Knowlarity, MyOperator, Ozonetel...), implement this
 * interface and register it in ./index.ts.
 */
export interface PlaceCallInput {
  agentNumber: string; // E.164, the CRM user's phone
  customerNumber: string; // E.164, the lead/contact
  callerId?: string | null; // E.164, the company number the customer sees; null = provider default
  statusCallbackUrl: string;
  record: boolean;
}

export interface PlaceCallResult {
  providerCallId: string;
  status: CallStatus;
  callerId?: string | null;
}

/** What we learned about a call, from a webhook or a status poll. Missing fields are unknown. */
export interface CallUpdate {
  providerCallId?: string | null;
  status?: CallStatus;
  durationSeconds?: number | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  recordingUrl?: string | null;
}

export interface RecordingDownload {
  data: Buffer;
  contentType: string;
}

export interface VoiceProvider {
  readonly key: string;
  readonly label: string;
  /** Env vars this provider still needs; empty when it is ready to call. */
  missingEnvVars(): string[];
  /** The caller ID used when the company has no numbers set up in the CRM. */
  defaultCallerId(): string | null;
  placeCall(input: PlaceCallInput): Promise<PlaceCallResult>;
  getCall(providerCallId: string): Promise<CallUpdate>;
  /** Turns a webhook body (already parsed: JSON or form fields) into an update. */
  parseCallback(body: Record<string, any>): CallUpdate;
  downloadRecording(url: string): Promise<RecordingDownload>;
}

export class VoiceProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
  }
}
