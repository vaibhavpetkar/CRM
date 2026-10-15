'use client';

import { forwardRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeftIcon,
  UserIcon,
  UserPlusIcon,
  EnvelopeIcon,
  PhoneIcon,
  MegaphoneIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  BriefcaseIcon,
  HomeModernIcon,
  BuildingOffice2Icon,
  MapPinIcon,
  CurrencyRupeeIcon,
} from '@heroicons/react/24/outline';
import UserAutocomplete from '@/components/ui/user-autocomplete';
import { useToast } from '@/components/ui/toast';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';
import { leadsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CONFIGURATION_OPTIONS, DESIGNATION_OPTIONS, LEAD_SOURCE_OPTIONS, PROPERTY_TYPE_OPTIONS } from '@/lib/lead-options';

const tenDigits = (label: string) =>
  z.string().optional().refine((v) => !v || /^\d{10}$/.test(v), `${label} must be 10 digits`);

const leadSchema = z.object({
  // Customer Details
  prefix: z.string().optional(),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Valid email is required'),
  mobile: z.string().regex(/^\d{10}$/, 'Mobile number must be 10 digits'),
  alternateMobile: tenDigits('Alternate mobile'),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  leadSource: z.string().optional(),
  nextFollowUp: z.string().optional(),
  assignedToId: z.union([z.string(), z.number()]).optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  // Property Requirement
  configuration: z.string().optional(),
  propertyType: z.string().optional(),
  preferredLocation: z.string().optional(),
  projectName: z.string().optional(),
  budgetMin: z.string().optional(),
  budgetMax: z.string().optional(),
});
type LeadFormValues = z.infer<typeof leadSchema>;

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all';
const PLAIN_INPUT = INPUT.replace('pl-10', 'pl-3');

function Section({ n, title, subtitle, children }: { n: number; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">{n}</span>
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Field({ label, required, error, className, children }: { label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[13px] font-medium text-slate-800">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

const IconInput = forwardRef<HTMLInputElement, React.ComponentProps<'input'> & { icon: React.ReactNode; invalid?: boolean }>(
  function IconInput({ icon, invalid, className, ...props }, ref) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        <input ref={ref} {...props} className={cn(INPUT, invalid && 'border-red-400 bg-red-50/40 focus:border-red-400 focus:ring-red-200', className)} />
      </div>
    );
  }
);

const IconSelect = forwardRef<HTMLSelectElement, React.ComponentProps<'select'> & { icon: React.ReactNode }>(
  function IconSelect({ icon, children, ...props }, ref) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        <select ref={ref} {...props} className={cn(INPUT, 'appearance-none pr-9')}>
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
    );
  }
);

/** Full-page "Add Lead" form: Customer Details first, then Property Requirement. */
export default function NewLeadPage() {
  const router = useRouter();
  const toast = useToast();
  // Duplicate warning: the lead being created waits here while the user decides.
  const [duplicateMatch, setDuplicateMatch] = useState<any | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, any> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: { leadSource: 'website', assignedToId: '' },
  });

  const toPayload = (data: LeadFormValues) => {
    const payload: Record<string, any> = {
      ...data,
      status: 'new',
      leadSource: (data.leadSource || 'website').toLowerCase().replace(/\s+/g, '-'),
      assignedToId: data.assignedToId ? Number(data.assignedToId) : null,
      budgetMin: data.budgetMin ? Number(data.budgetMin) : null,
      budgetMax: data.budgetMax ? Number(data.budgetMax) : null,
    };
    // Blank optional fields are left out so the backend keeps its defaults.
    Object.keys(payload).forEach((k) => {
      if (payload[k] === '' || payload[k] === undefined) delete payload[k];
    });
    return payload;
  };

  const create = async (payload: Record<string, any>) => {
    const res = await leadsApi.createLead(payload);
    toast.success('Lead created.');
    const id = res?.lead?.id;
    router.push(id ? `/leads/${id}` : '/leads');
  };

  const onSubmit = async (data: LeadFormValues) => {
    const payload = toPayload(data);
    try {
      const { duplicate } = await leadsApi.checkDuplicate(data.email, data.mobile);
      if (duplicate) {
        setDuplicateMatch(duplicate);
        setPendingPayload(payload);
        return;
      }
      await create(payload);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save lead');
    }
  };

  const continueAnyway = async () => {
    if (!pendingPayload) return;
    try {
      await create({ ...pendingPayload, allowDuplicate: true });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save lead');
    } finally {
      setDuplicateMatch(null);
      setPendingPayload(null);
    }
  };

  useKeyboardShortcuts({
    onEscape: () => (duplicateMatch ? setDuplicateMatch(null) : router.push('/leads')),
    onSave: () => handleSubmit(onSubmit)(),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => router.push('/leads')} aria-label="Back to leads" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[var(--primary)]">
          <UserPlusIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add New Lead</h1>
          <p className="text-sm text-slate-500">Create a new lead and assign it to your sales team.</p>
        </div>
      </div>

      <Section n={1} title="Customer Details" subtitle="Who the customer is and how to reach them.">
        <Field label="Salutation">
          <select {...register('prefix')} className={cn(PLAIN_INPUT, 'appearance-none')}>
            <option value="">—</option>
            {['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.'].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="First Name" required error={errors.firstName?.message}>
          <IconInput icon={<UserIcon />} placeholder="Enter first name" invalid={!!errors.firstName} {...register('firstName')} />
        </Field>
        <Field label="Last Name" required error={errors.lastName?.message}>
          <IconInput icon={<UserIcon />} placeholder="Enter last name" invalid={!!errors.lastName} {...register('lastName')} />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <IconInput icon={<EnvelopeIcon />} type="email" placeholder="Enter email address" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Mobile Number" required error={errors.mobile?.message}>
          <IconInput icon={<PhoneIcon />} type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" invalid={!!errors.mobile} {...register('mobile')} />
        </Field>
        <Field label="Alternate Mobile" error={errors.alternateMobile?.message}>
          <IconInput icon={<PhoneIcon />} type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" invalid={!!errors.alternateMobile} {...register('alternateMobile')} />
        </Field>
        <Field label="Telephone">
          <IconInput icon={<PhoneIcon />} type="tel" placeholder="Landline (optional)" {...register('phone')} />
        </Field>
        <Field label="Designation">
          <IconSelect icon={<BriefcaseIcon />} {...register('jobTitle')}>
            <option value="">— Select —</option>
            {DESIGNATION_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </IconSelect>
        </Field>
        <Field label="Lead Source">
          <IconSelect icon={<MegaphoneIcon />} {...register('leadSource')}>
            {LEAD_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </IconSelect>
        </Field>
        <Field label="Next Follow-up Schedule">
          <IconInput icon={<CalendarDaysIcon />} type="date" {...register('nextFollowUp')} />
        </Field>
        <Field label="Assigned To (Lead Owner)">
          <UserAutocomplete
            value={watch('assignedToId') || ''}
            onChange={(val) => setValue('assignedToId', val)}
            placeholder="Search team member..."
            icon={<UserIcon />}
            inputClassName={INPUT}
          />
          <p className="mt-1 text-[11px] text-slate-500">Left blank, lead rotation (if on) picks the next sales person.</p>
        </Field>
        <Field label="Address" className="sm:col-span-2 lg:col-span-3">
          <textarea rows={2} {...register('street')} placeholder="House / building, street, area" className={PLAIN_INPUT} />
        </Field>
        <Field label="City">
          <input {...register('city')} className={PLAIN_INPUT} />
        </Field>
        <Field label="State">
          <input {...register('state')} className={PLAIN_INPUT} />
        </Field>
        <Field label="Pincode">
          <input {...register('zipCode')} inputMode="numeric" className={PLAIN_INPUT} />
        </Field>
        <Field label="Country">
          <input {...register('country')} placeholder="India" className={PLAIN_INPUT} />
        </Field>
      </Section>

      <Section n={2} title="Property Requirement" subtitle="What the customer is looking for.">
        <Field label="Configuration">
          <IconSelect icon={<HomeModernIcon />} {...register('configuration')}>
            <option value="">— Select —</option>
            {CONFIGURATION_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </IconSelect>
        </Field>
        <Field label="Property Type">
          <IconSelect icon={<BuildingOffice2Icon />} {...register('propertyType')}>
            <option value="">— Select —</option>
            {PROPERTY_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </IconSelect>
        </Field>
        <Field label="Preferred Area">
          <IconInput icon={<MapPinIcon />} placeholder="e.g. Baner, Pune" {...register('preferredLocation')} />
        </Field>
        <Field label="Project / Listing">
          <IconInput icon={<BuildingOffice2Icon />} placeholder="Project or listing name" {...register('projectName')} />
        </Field>
        <Field label="Budget From (₹)">
          <IconInput icon={<CurrencyRupeeIcon />} type="number" min={0} step={100000} placeholder="e.g. 5000000" {...register('budgetMin')} />
        </Field>
        <Field label="Budget To (₹)">
          <IconInput icon={<CurrencyRupeeIcon />} type="number" min={0} step={100000} placeholder="e.g. 7500000" {...register('budgetMax')} />
        </Field>
      </Section>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 md:-mx-8 md:-mb-8 md:px-8">
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.push('/leads')} className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-600/20 hover:bg-[var(--primary-hover)] disabled:opacity-60">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M8 4v5h7V4M8 20v-6h8v6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
            {isSubmitting ? 'Saving...' : 'Save Lead'}
          </button>
        </div>
      </div>

      {duplicateMatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Possible Duplicate Lead</h3>
            <p className="mt-2 text-sm text-slate-600">A lead with this email address or mobile number already exists.</p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">
                {duplicateMatch.name || `${duplicateMatch.firstName || ''} ${duplicateMatch.lastName || ''}`.trim()}
              </p>
              <p className="text-slate-500">{duplicateMatch.email || duplicateMatch.mobile}</p>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setDuplicateMatch(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={continueAnyway} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Continue Anyway
              </button>
              <button type="button" onClick={() => router.push(`/leads/${duplicateMatch.id}`)} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">
                View Existing Lead
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
