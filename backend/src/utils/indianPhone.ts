/**
 * Indian phone numbers for click-to-call.
 *
 * People type numbers every way: "98765 43210", "098765-43210",
 * "+91 98765 43210", "91-22-12345678" (a Mumbai landline). Every Indian
 * number is a 10-digit national number starting 2-9 (mobiles start 6-9,
 * landlines are STD code + subscriber number), so we strip the trunk "0" or
 * the "+91"/"91" country code and return E.164 (+91XXXXXXXXXX), or null when
 * the input can't be an Indian number.
 */
export const normalizeIndianNumber = (input: string | null | undefined): string | null => {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (hasPlus) {
    if (!digits.startsWith('91')) return null; // some other country
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 14 && digits.startsWith('0091')) {
    digits = digits.slice(4);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return /^[2-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
};

/** "+919876543210" -> "+91 98765 43210", for display. */
export const formatIndianNumber = (e164: string) =>
  /^\+91[6-9]\d{9}$/.test(e164) ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : /^\+91\d{10}$/.test(e164) ? `+91 ${e164.slice(3)}` : e164;
