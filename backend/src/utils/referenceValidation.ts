import { ModelStatic, Model } from 'sequelize';

export interface ReferenceSpec {
  label: string;
  model: ModelStatic<Model>;
}

/**
 * Checks FK fields (assignedToId, leadId, ...) before an insert/update so a bad
 * value comes back as a clear, field-specific message instead of a raw
 * Postgres error. Without this, a non-numeric string (free text left in a
 * search box) 500s with "invalid input syntax for type integer", and a stale
 * or nonexistent id 500s/400s on the FK constraint without saying which field
 * was wrong. Same idea as validateUserReferences in LeadService.
 *
 * Returns the error message for the first bad field, or null if all are fine.
 * Fields that are undefined, null or '' are skipped (callers normalize those).
 */
export const findInvalidReference = async (
  data: Record<string, unknown>,
  refs: Record<string, ReferenceSpec>
): Promise<string | null> => {
  for (const [field, { label, model }] of Object.entries(refs)) {
    const value = data[field];
    if (value === undefined || value === null || value === '') continue;

    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      return `${label} must be picked from the list ("${value}" is not a valid selection)`;
    }

    // paranoid: false so soft-deleted rows still count; the DB FK accepts
    // them, so rejecting them here would be stricter than before.
    const exists = await model.count({ where: { id }, paranoid: false } as any);
    if (!exists) {
      return `The selected ${label} no longer exists. Please pick it again.`;
    }
  }
  return null;
};
