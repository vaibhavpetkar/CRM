import './globals.css';
import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  // The sign-in page must clearly name its owner: a login page titled with a
  // generic product name on a company domain is what Google Safe Browsing
  // flags as "possible phishing on user login".
  title: 'Inveon One CRM — Inveon Technologies',
  description: 'Staff sign-in for the Inveon Technologies CRM at crm.inveontechnologies.in.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full font-sans" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
