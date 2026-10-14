import { redirect } from 'next/navigation';

// Lead Sources is now a step of the Reports & Analytics wizard.
export default function LeadSourcesPage() {
  redirect('/reports?step=lead-sources');
}
