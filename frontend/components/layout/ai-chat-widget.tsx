'use client';

import { useEffect, useRef, useState } from 'react';
import { SparklesIcon, XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { aiApi } from '@/lib/api';

type ChatMessage = { role: 'user' | 'assistant'; text: string };

/**
 * Item 9 — AI chat widget, styled as a floating DM-style panel (like
 * Instagram's message popout) rather than a full page. Uses whichever AI
 * provider is actually configured server-side (free/local Ollama or paid
 * Anthropic — see aiService.ts); if neither is set up, this shows that
 * plainly instead of a fake conversation.
 */
export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<{ configured: boolean; provider: 'ollama' | 'anthropic' | null } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aiApi
      .getStatus()
      .then(setStatus)
      .catch(() => setStatus({ configured: false, provider: null }));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const res = await aiApi.chat(text, messages);
      setMessages([...nextMessages, { role: 'assistant', text: res.reply }]);
    } catch (err: any) {
      setError(err.message || 'Something went wrong — try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label="AI Assistant chat"
        title="AI Assistant"
      >
        <SparklesIcon className="h-[18px] w-[18px]" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="fixed bottom-4 right-4 z-20 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:bottom-auto sm:right-0 sm:top-full sm:mt-1">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#168eea] to-[#0f6fc0] px-4 py-3">
              <div className="flex items-center gap-2 text-white">
                <SparklesIcon className="h-4 w-4" />
                <p className="text-sm font-semibold">AI Assistant</p>
                {status?.configured && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium">
                    {status.provider === 'ollama' ? 'Free' : 'Claude'}
                  </span>
                )}
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Not configured */}
            {status && !status.configured && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <SparklesIcon className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">AI Assistant isn't set up yet</p>
                <p className="text-xs text-slate-500">
                  Ask an admin to set <code className="rounded bg-slate-100 px-1 py-0.5">OLLAMA_BASE_URL</code> (free) or{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5">ANTHROPIC_API_KEY</code> (paid) on the server.
                </p>
              </div>
            )}

            {/* Configured: message list */}
            {status?.configured && (
              <>
                <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-400">
                      <SparklesIcon className="h-8 w-8 text-slate-200" />
                      <p className="text-xs">
                        Ask about your pipeline, overdue tasks, or pending quotes —<br />
                        answered from your CRM's real current numbers.
                      </p>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                          m.role === 'user'
                            ? 'rounded-br-sm bg-[#168eea] text-white'
                            : 'rounded-bl-sm bg-slate-100 text-slate-800'
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {error && <p className="text-center text-xs text-amber-600">{error}</p>}
                </div>

                {/* Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-2 border-t border-slate-100 p-3"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Message..."
                    disabled={sending}
                    className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea] disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#168eea] text-white transition-opacity disabled:opacity-40"
                    aria-label="Send"
                  >
                    <PaperAirplaneIcon className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
