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

/**
 * Same problem as sanitizeDateFields, but for numeric/integer columns
 * (FK id fields, counts, coordinates, etc.). Number inputs and unfilled
 * "select a user" dropdowns send '' when left blank, and Postgres rejects
 * '' outright for an INTEGER column ("invalid input syntax for type
 * integer: \"\""), which surfaces as an unhandled 500 rather than a
 * validation error since it happens at the SQL layer, not Sequelize's
 * validate step.
 *
 * Normalizes '' -> null for a whitelisted set of numeric fields on a plain
 * object. Non-string / already-null / populated values are left untouched.
 */
export const sanitizeNumericFields = <T extends Record<string, unknown>>(data: T, fields: (keyof T)[]): T => {
  const sanitized: T = { ...data };
  for (const field of fields) {
    if (sanitized[field] === '') {
      sanitized[field] = null as T[typeof field];
    }
  }
  return sanitized;
};
