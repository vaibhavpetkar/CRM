import { z } from 'zod';

// ── Reusable field schemas ──────────────────────────────────────────

export const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

export const passwordField = z
  .string()
  .min(6, 'Password must be at least 6 characters');

export const nameField = (label = 'Name') =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(100, `${label} must be under 100 characters`);

export const phoneField = z
  .string()
  .trim()
  .refine(
    (val) => !val || /^\+?[\d\s\-().]{7,20}$/.test(val),
    'Please enter a valid phone number'
  )
  .optional()
  .or(z.literal(''));

export const urlField = z
  .string()
  .trim()
  .refine(
    (val) =>
      !val ||
      /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w\-./?%&=]*)?$/.test(val),
    'Please enter a valid URL'
  )
  .optional()
  .or(z.literal(''));

export const amountField = (label = 'Amount') =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`);

export const positiveAmountField = (label = 'Amount') =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .min(0.01, `${label} must be greater than 0`);

export const percentageField = (label = 'Percentage') =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .min(0, `${label} must be between 0 and 100`)
    .max(100, `${label} must be between 0 and 100`);

export const futureDateField = (label = 'Date') =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((val) => {
      const d = new Date(val);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d >= today;
    }, `${label} cannot be in the past`);

export const optionalDateField = z.string().optional().or(z.literal(''));

export const requiredField = (label = 'This field') =>
  z.string().trim().min(1, `${label} is required`);

export const optionalField = z.string().trim().optional().or(z.literal(''));

// ── Form schemas ────────────────────────────────────────────────────

// Auth - Forgot Password
export const forgotPasswordSchema = z.object({
  email: emailField,
});

// Auth - Reset Password
export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Auth - Accept Invite
export const acceptInviteSchema = z
  .object({
    firstName: nameField('First name'),
    lastName: nameField('Last name'),
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Leads
export const leadSchema = z.object({
  firstName: nameField('First name'),
  lastName: nameField('Last name'),
  email: emailField,
  phone: phoneField,
  company: optionalField,
  title: optionalField,
  source: optionalField,
  status: optionalField,
  value: amountField('Lead value').optional(),
});

// Contacts
export const contactSchema = z.object({
  firstName: nameField('First name'),
  lastName: nameField('Last name'),
  email: emailField,
  phone: phoneField,
  company: optionalField,
  title: optionalField,
  website: urlField,
  address: optionalField,
});

// Deals
export const dealSchema = z.object({
  title: requiredField('Deal title'),
  contactId: requiredField('Contact'),
  value: amountField('Deal value'),
  probability: percentageField('Probability').optional(),
  stage: optionalField,
  expectedCloseDate: optionalDateField,
  description: optionalField,
});

// Tasks
export const taskSchema = z.object({
  title: requiredField('Task title'),
  description: optionalField,
  priority: optionalField,
  status: optionalField,
  assigneeId: optionalField,
  dueDate: optionalDateField,
});

// Meetings
export const meetingSchema = z.object({
  title: requiredField('Meeting title'),
  date: requiredField('Date'),
  time: requiredField('Time'),
  duration: requiredField('Duration'),
  location: optionalField,
  description: optionalField,
  meetingLink: urlField,
});

// Invoices
export const invoiceSchema = z.object({
  contactId: requiredField('Contact'),
  invoiceNumber: optionalField,
  issuedDate: requiredField('Issue date'),
  dueDate: requiredField('Due date'),
  status: optionalField,
  notes: optionalField,
});

// Quotes
export const quoteSchema = z.object({
  client: requiredField('Client name'),
  amount: positiveAmountField('Amount'),
  validUntil: optionalDateField,
  status: optionalField,
  notes: optionalField,
});

// Items / Products
export const itemSchema = z.object({
  name: requiredField('Item name'),
  sku: optionalField,
  sellingPrice: amountField('Selling price'),
  purchasePrice: amountField('Purchase price').optional(),
  description: optionalField,
  category: optionalField,
  unit: optionalField,
  hsnCode: optionalField,
  taxId: optionalField,
});

// Marketing Campaigns
export const campaignSchema = z.object({
  name: requiredField('Campaign name'),
  type: optionalField,
  status: optionalField,
  budget: amountField('Budget').optional(),
  startDate: optionalDateField,
  endDate: optionalDateField,
  description: optionalField,
});

// Team Invite
export const teamInviteSchema = z.object({
  email: emailField,
  firstName: nameField('First name'),
  lastName: nameField('Last name'),
  role: requiredField('Role'),
});

// Calendar Events
export const calendarEventSchema = z.object({
  title: requiredField('Event title'),
  startDate: requiredField('Start date'),
  endDate: requiredField('End date'),
  description: optionalField,
});

// Settings - Profile
export const profileSchema = z.object({
  firstName: nameField('First name'),
  lastName: nameField('Last name'),
  email: emailField,
  phone: phoneField,
});

// Settings - Change Password
export const changePasswordSchema = z
  .object({
    currentPassword: requiredField('Current password'),
    newPassword: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Settings - Company
export const companySchema = z.object({
  name: requiredField('Company name'),
  email: z
    .string()
    .trim()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), 'Please enter a valid email')
    .optional()
    .or(z.literal('')),
  phone: phoneField,
  website: urlField,
  address: optionalField,
  city: optionalField,
  state: optionalField,
  country: optionalField,
  zip: optionalField,
});

// ── Utility: validate form data against a schema ────────────────────

export type FieldErrors = Record<string, string>;

/**
 * Validates formData against a Zod schema.
 * Returns { success: true, data } on success or { success: false, errors } on failure.
 * The `errors` object maps field names to their first error message.
 */
export function validateForm<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: FieldErrors } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }
  return { success: false, errors };
}
