import { redirect } from 'next/navigation';

// Marketing Analytics is now a step of the Reports & Analytics wizard.
export default function MarketingAnalyticsPage() {
  redirect('/reports?step=marketing');
}
