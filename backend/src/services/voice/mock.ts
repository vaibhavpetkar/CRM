import crypto from 'crypto';
import { CallUpdate, PlaceCallInput, PlaceCallResult, RecordingDownload, VoiceProvider } from './types';

/**
 * A pretend provider for development and demos (VOICE_PROVIDER=mock). No
 * phone rings: the call "rings" for 4 seconds, "talks" for 10, then
 * completes with a short generated tone as its recording, so the whole
 * calling panel, notes and recording flow can be tried without an account.
 */
const RING_MS = 4000;
const TALK_MS = 10000;
const started = new Map<string, number>();

const tone = (seconds: number): Buffer => {
  const rate = 8000;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
};

export class MockProvider implements VoiceProvider {
  readonly key = 'mock';
  readonly label = 'Demo (no real calls)';

  missingEnvVars() {
    return [];
  }

  async placeCall(_input: PlaceCallInput): Promise<PlaceCallResult> {
    const id = `mock-${crypto.randomBytes(8).toString('hex')}`;
    started.set(id, Date.now());
    return { providerCallId: id, status: 'ringing', callerId: '+910000000000' };
  }

  async getCall(providerCallId: string): Promise<CallUpdate> {
    const t0 = started.get(providerCallId);
    if (!t0) return { status: 'failed' };
    const elapsed = Date.now() - t0;
    if (elapsed < RING_MS) return { status: 'ringing' };
    if (elapsed < RING_MS + TALK_MS) return { status: 'in-progress', startedAt: new Date(t0 + RING_MS) };
    return {
      status: 'completed',
      startedAt: new Date(t0 + RING_MS),
      endedAt: new Date(t0 + RING_MS + TALK_MS),
      durationSeconds: TALK_MS / 1000,
      recordingUrl: `mock://${providerCallId}`,
    };
  }

  parseCallback(body: Record<string, any>): CallUpdate {
    return { status: body.status };
  }

  async downloadRecording(_url: string): Promise<RecordingDownload> {
    return { data: tone(2), contentType: 'audio/wav' };
  }
}
