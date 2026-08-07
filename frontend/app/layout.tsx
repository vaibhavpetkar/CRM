import './globals.css';
import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'CRM Pro — Customer Relationship Management',
  description: 'Professional CRM solution for sales, marketing, and customer management',
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
