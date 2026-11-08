// Call notes on leads: "13/09/26 CNR (SAKSHI)".
//
// detectNoteStatus() reads what a sales person wrote and finds the lead
// status it means ("cnr", "not picking", "swich off", "whatsap done" ...),
// so writing a note moves the lead to that status.
//
// parseNotesCell() splits a whole column of notes from an Excel sheet,
// written any old way, into separate dated notes:
//   "31/10/26- CNR (SS) 01/11/26- CNR (SS) .03/11/26 CNR (SADIYA) 06/11/26, SWITCH OFF  (SHABINA)"

// Words and phrases for each status, lower case. Matching is on whole words,
// with small typing mistakes allowed on longer words (see detectNoteStatus).
// Keep the statuses in sync with ACTIVE_LEAD_STATUSES (validations/leadValidation.ts).
export const NOTE_STATUS_KEYWORDS: { status: string; phrases: string[] }[] = [
  {
    status: 'cnr',
    phrases: [
      'cnr', 'call not received', 'call not receive', 'call not recived', 'not received', 'not receiving', 'not recived',
      'call not picked', 'not picked', 'not picking', 'not pick', 'no answer', 'not answering', 'not answered',
      'no response', 'rnr', 'ringing', 'nr',
    ],
  },
  { status: 'call-busy', phrases: ['busy', 'bussy', 'call busy', 'line busy', 'call cut', 'cut the call', 'call disconnected', 'disconnected'] },
  {
    status: 'switch-off',
    phrases: [
      'switch off', 'switched off', 'switch of', 'switchoff', 'sw off', 'phone off', 'mobile off',
      'not reachable', 'unreachable', 'out of coverage', 'out of network', 'not in service',
    ],
  },
  { status: 'call-later', phrases: ['call later', 'call back', 'callback', 'call me later', 'call tomorrow', 'call after', 'call next week', 'call in evening'] },
  { status: 'not-interested', phrases: ['not interested', 'not intrested', 'no interest', 'not interest', 'ni', 'no requirement', 'no need'] },
  { status: 'invalid-number', phrases: ['invalid number', 'invalid no', 'invalid', 'number does not exist', 'does not exist', 'not exist', 'incorrect number'] },
  { status: 'wrong-number', phrases: ['wrong number', 'wrong no', 'wrong'] },
  { status: 'whatsapp-done', phrases: ['whatsapp done', 'whatsapp', 'whats app', 'wa done', 'watsapp', 'whatsup', 'msg done', 'message done'] },
  { status: 'details-shared', phrases: ['details shared', 'detail shared', 'details sent', 'detail sent', 'shared details', 'brochure sent', 'brochure shared', 'info shared'] },
  { status: 'site-visit-done', phrases: ['site visit done', 'site visit', 'visit done', 'sv done', 'site visited', 'visited site'] },
  { status: 'revisit-done', phrases: ['revisit done', 'revisit', 're visit', 'second visit'] },
  { status: 'ready-possession', phrases: ['ready possession', 'ready to move', 'ready possesion', 'looking for ready'] },
  { status: 'budget-issue', phrases: ['budget issue', 'budget problem', 'low budget', 'budget', 'too costly', 'costly', 'expensive', 'high price'] },
  { status: 'loan-problem', phrases: ['loan problem', 'loan issue', 'loan not approved', 'loan'] },
  { status: 'final-rate-given', phrases: ['final rate given', 'final rate', 'final price', 'rate given', 'best rate given'] },
  { status: 'plan-dropped', phrases: ['plan dropped', 'plan drop', 'dropped', 'drop the plan', 'already purchased', 'already bought', 'not planning'] },
  { status: 'plan-on-hold', phrases: ['plan on hold', 'plan is on hold', 'on hold', 'hold'] },
  { status: 'postponed', phrases: ['postponed', 'postpone', 'post pone', 'post poned'] },
  { status: 'nearing-possession', phrases: ['nearing possession', 'near possession', 'nearing possesion', 'looking for nearing'] },
];

/** Lower case words, no punctuation; "C.N.R" and "c n r" become "cnr". */
const words = (text: string) => {
  const cleaned = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  // Join runs of single letters: "c n r" -> "cnr", "w a done" -> "wa done".
  const out: string[] = [];
  let run = '';
  for (const w of cleaned.split(' ').filter(Boolean)) {
    if (w.length === 1 && /[a-z]/.test(w)) {
      run += w;
      continue;
    }
    if (run) out.push(run);
    run = '';
    out.push(w);
  }
  if (run) out.push(run);
  return out;
};

const editDistance = (a: string, b: string, max: number) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

// How many typing mistakes a phrase may have and still count: none on short
// words (so "buy" is never "busy"), one on 5-7 letters, two on longer ones.
const allowedMistakes = (length: number) => (length >= 9 ? 2 : length >= 5 ? 1 : 0);

const PHRASES = NOTE_STATUS_KEYWORDS.flatMap(({ status, phrases }) =>
  phrases.map((p) => {
    const tokens = words(p);
    return { status, tokens, joined: tokens.join('') };
  })
);

/**
 * The lead status a note means, or null. "CNR", "not picking", "Switch Off",
 * "swich off", "whatsap done", "Not intrested" all work. When a note names
 * more than one, the first one written wins ("Busy, call later" is Call Busy).
 */
export const detectNoteStatus = (text: string): string | null => {
  const tokens = words(text);
  if (!tokens.length) return null;
  let best: { pos: number; mistakes: number; size: number; status: string } | null = null;
  for (const phrase of PHRASES) {
    const k = phrase.tokens.length;
    const limit = allowedMistakes(phrase.joined.length);
    // Also try one word more or fewer, so "switchoff" and "whats app" match.
    for (let size = Math.max(1, k - 1); size <= k + 1; size++) {
      for (let pos = 0; pos + size <= tokens.length; pos++) {
        const window = tokens.slice(pos, pos + size);
        const joined = window.join('');
        let mistakes: number;
        if (joined === phrase.joined) mistakes = 0;
        else if (!limit || joined[0] !== phrase.joined[0]) continue;
        else mistakes = editDistance(joined, phrase.joined, limit);
        if (mistakes > limit) continue;
        // A fuzzy match must line up word for word, or "invalid" would match inside other text.
        if (mistakes > 0 && size !== k) continue;
        const better =
          !best ||
          pos < best.pos ||
          (pos === best.pos && (mistakes < best.mistakes || (mistakes === best.mistakes && phrase.joined.length > best.size)));
        if (better) best = { pos, mistakes, size: phrase.joined.length, status: phrase.status };
      }
    }
  }
  return best?.status ?? null;
};

// ─── Parsing a notes column from a spreadsheet ───────────────────────────────

export interface ParsedNote {
  noteDate: string; // YYYY-MM-DD
  text: string; // "CNR"
  salesPersonName: string | null; // "SS"
  status: string | null; // "cnr"
}

const pad = (n: number) => String(n).padStart(2, '0');

const realDay = (d: number, m: number, y: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

// 31/10/26, 31-10-2026, 31.10.26, "31 / 10 / 26" (day first, the Indian way).
const DATE_IN_TEXT = /(?<!\d)(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})(?!\d)/g;

const SEPARATORS = /^[\s\-–—:,.;|/\\]+|[\s\-–—:,.;|/\\]+$/g;

/** "CNR (SS)" -> { text: "CNR", name: "SS" }; the last bracket is the sales person. */
const splitName = (segment: string) => {
  const brackets = [...segment.matchAll(/\(([^()]*)\)/g)];
  const last = brackets[brackets.length - 1];
  if (!last) return { text: segment.replace(SEPARATORS, '').replace(/\s+/g, ' '), name: null };
  const name = last[1].replace(/\s+/g, ' ').trim() || null;
  const text = (segment.slice(0, last.index) + ' ' + segment.slice((last.index || 0) + last[0].length))
    .replace(/\s+/g, ' ')
    .replace(SEPARATORS, '')
    .trim();
  return { text, name };
};

/**
 * Splits a notes cell into dated notes, oldest first as written. Each note is
 * a date followed by what happened and, in brackets, who wrote it. Commas,
 * dashes, dots and line breaks between them don't matter. Text before the
 * first date (or a cell with no dates at all) becomes a note on `fallbackDay`.
 */
export const parseNotesCell = (raw: unknown, fallbackDay: string): ParsedNote[] => {
  const cell = String(raw ?? '').replace(/\r?\n|\t/g, ' ').trim();
  if (!cell) return [];

  const marks: { index: number; end: number; day: string }[] = [];
  for (const m of cell.matchAll(DATE_IN_TEXT)) {
    let y = Number(m[3]);
    if (m[3].length === 2) y += 2000;
    const day = realDay(Number(m[1]), Number(m[2]), y);
    if (day) marks.push({ index: m.index || 0, end: (m.index || 0) + m[0].length, day });
  }

  const notes: ParsedNote[] = [];
  const add = (day: string, segment: string) => {
    const { text, name } = splitName(segment);
    if (!text && !name) return;
    const body = text || '—';
    notes.push({ noteDate: day, text: body.slice(0, 2000), salesPersonName: name ? name.slice(0, 100) : null, status: detectNoteStatus(body) });
  };

  const before = cell.slice(0, marks.length ? marks[0].index : cell.length);
  if (before.replace(SEPARATORS, '').trim()) add(fallbackDay, before);
  marks.forEach((mark, i) => add(mark.day, cell.slice(mark.end, i + 1 < marks.length ? marks[i + 1].index : cell.length)));
  return notes;
};

/** "2026-09-13" -> "13/09/26" */
export const shortNoteDay = (day: string) => {
  const [y, m, d] = String(day).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : String(day);
};

/** "13/09/26 CNR (SAKSHI)" */
export const formatNoteLine = (n: { noteDate: string; text: string; salesPersonName?: string | null }) =>
  `${shortNoteDay(n.noteDate)} ${n.text}${n.salesPersonName ? ` (${n.salesPersonName})` : ''}`;

// ─── Matching the name in brackets to a user ─────────────────────────────────

export interface NoteUser {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Finds the user a bracketed name means: their full name, first name, last
 * name, email name or initials ("SS" for Sakshi Shinde). Only a name that
 * fits exactly one user is matched; anything else stays as written.
 */
export const buildUserMatcher = (users: NoteUser[]) => {
  const keys = new Map<string, Set<number>>();
  const put = (key: string, id: number) => {
    if (!key) return;
    if (!keys.has(key)) keys.set(key, new Set());
    keys.get(key)!.add(id);
  };
  for (const u of users) {
    const first = norm(u.firstName);
    const last = norm(u.lastName);
    put(`${first} ${last}`.trim(), u.id);
    put(`${first}${last}`, u.id);
    put(first, u.id);
    put(last, u.id);
    put(norm(String(u.email || '').split('@')[0]), u.id);
    const initials = `${first.split(' ').filter(Boolean).map((w) => w[0]).join('')}${last.split(' ').filter(Boolean).map((w) => w[0]).join('')}`;
    if (initials.length >= 2) put(`initials:${initials}`, u.id);
  }
  const cache = new Map<string, number | null>();
  return (name: string | null | undefined): number | null => {
    const key = norm(name);
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    const tryKey = (k: string) => {
      const ids = keys.get(k);
      return ids && ids.size === 1 ? [...ids][0] : null;
    };
    let id = tryKey(key) ?? tryKey(key.replace(/\s+/g, ''));
    if (id == null && /^[a-z]{2,4}$/.test(key.replace(/\s+/g, ''))) id = tryKey(`initials:${key.replace(/\s+/g, '')}`);
    cache.set(key, id);
    return id;
  };
};
