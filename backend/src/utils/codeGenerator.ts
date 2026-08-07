import sequelize from '../config/database';
import Sequence from '../models/Sequence';

/**
 * Atomically generates the next human-friendly code for a given sequence key,
 * e.g. generateCode('ITEM', 'ITEM') -> "ITEM-00001", "ITEM-00002", ...
 *
 * Safe under concurrent requests: the sequence row is locked (SELECT ... FOR UPDATE)
 * for the duration of the transaction, so two simultaneous creates can never
 * receive the same number.
 *
 * Pass `includeYear: true` for transactional documents (Lead, Quote, Invoice) that
 * should be numbered per-calendar-year, e.g. "LEAD-2026-00001". In that mode the
 * sequence itself is scoped by year internally (key gets a `_${year}` suffix), so
 * the running number automatically resets back to 00001 on Jan 1 each year instead
 * of climbing forever. Master data (Item, Category, Tax) should omit this flag and
 * keeps its existing flat "PREFIX-00001" numbering.
 *
 * @param key         Internal sequence key, one row per key (per year, if includeYear) in the `sequences` table.
 * @param prefix      Human-readable prefix printed in the code, e.g. "ITEM", "LEAD".
 * @param padLength   Zero-padding width for the number portion (default 5 -> 00001).
 * @param includeYear When true, scopes the counter to the current year and embeds the year in the code.
 */
export async function generateCode(
  key: string,
  prefix: string,
  padLength = 5,
  includeYear = false
): Promise<string> {
  const year = new Date().getFullYear();
  const sequenceKey = includeYear ? `${key}_${year}` : key;

  return sequelize.transaction(async (t) => {
    // Ensure the row exists first (no-op if already present).
    await Sequence.findOrCreate({
      where: { key: sequenceKey },
      defaults: { key: sequenceKey, currentNumber: 0 },
      transaction: t,
    });

    // Lock the row for update so concurrent transactions serialize here.
    const seq = await Sequence.findOne({
      where: { key: sequenceKey },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const next = (seq?.currentNumber ?? 0) + 1;
    await Sequence.update({ currentNumber: next }, { where: { key: sequenceKey }, transaction: t });

    const number = String(next).padStart(padLength, '0');
    return includeYear ? `${prefix}-${year}-${number}` : `${prefix}-${number}`;
  });
}
