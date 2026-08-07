/**
 * HTML date/datetime-local inputs send an empty string ('') — not null or
 * undefined — when the field is left blank. Sequelize DATE/DATEONLY columns
 * reject '' outright (it fails Date parsing), which surfaces as a confusing
 * 422 "Validation failed" even though the request was otherwise well-formed.
 *
 * This normalizes '' -> null for a whitelisted set of date fields on a
 * plain object, in place of writing the same `field === '' ? null : field`
 * check at every call site. Non-string / already-null / populated values are
 * left untouched.
 */
export const sanitizeDateFields = <T extends Record<string, unknown>>(data: T, fields: (keyof T)[]): T => {
  const sanitized: T = { ...data };
  for (const field of fields) {
    if (sanitized[field] === '') {
      sanitized[field] = null as T[typeof field];
    }
  }
  return sanitized;
};
