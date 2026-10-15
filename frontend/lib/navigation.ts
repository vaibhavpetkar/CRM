import type { ComponentType } from 'react';
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  UsersIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  CalendarDaysIcon,
  MegaphoneIcon,
  EnvelopeIcon,
  DocumentDuplicateIcon,
  BuildingOffice2Icon,
  CreditCardIcon,
  ClockIcon,
  TrashIcon,
  CubeIcon,
  BanknotesIcon,
  TagIcon,
  PuzzlePieceIcon,
  PhoneIcon,
  MapPinIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

export type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Permission key required to see/access this item (a list means any one of them). Omit for items open to every logged-in user. */
  permission?: string | string[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const navigation: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
      // One wizard page holds every report: overview, forecast, P&L,
      // marketing analytics and lead sources (each step checks its own permission).
      { name: 'Reports & Analytics', href: '/reports', icon: ChartBarIcon, permission: ['reports:view', 'marketing:view', 'leads:read'] },
    ],
  },
  {
    title: 'Sales',
    items: [
      { name: 'Leads', href: '/leads', icon: ClipboardDocumentListIcon, permission: 'leads:read' },
      { name: 'Sales Activity', href: '/sales-activity', icon: SignalIcon },
      { name: 'Call Tracking', href: '/call-tracking', icon: PhoneIcon },
      { name: 'Site Visits', href: '/site-visits', icon: MapPinIcon, permission: 'leads:read' },
      { name: 'Tasks', href: '/tasks', icon: CheckCircleIcon, permission: 'tasks:view' },
      { name: 'Meetings', href: '/meetings', icon: CalendarDaysIcon, permission: 'meetings:view' },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { name: 'Campaigns', href: '/marketing/campaigns', icon: MegaphoneIcon, permission: 'marketing:view' },
      { name: 'Email', href: '/marketing/email', icon: EnvelopeIcon, permission: 'marketing:view' },
      { name: 'Templates', href: '/marketing/templates', icon: DocumentDuplicateIcon, permission: 'marketing:view' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { name: 'Items', href: '/items', icon: CubeIcon, permission: 'items:read' },
      { name: 'Categories', href: '/items/categories', icon: TagIcon, permission: 'item_categories:read' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { name: 'Expenses', href: '/expenses', icon: BanknotesIcon, permission: 'expenses:read' },
    ],
  },
  {
    title: 'Automation',
    items: [
      { name: 'Document Templates', href: '/document-templates', icon: DocumentTextIcon, permission: 'document_templates:read' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { name: 'Team', href: '/team', icon: UsersIcon, permission: 'users:read' },
      { name: 'Company', href: '/settings/company', icon: BuildingOffice2Icon, permission: 'company:manage' },
      { name: 'Subscription', href: '/settings/subscription', icon: CreditCardIcon, permission: 'company:manage' },
      { name: 'Integrations', href: '/settings/integrations', icon: PuzzlePieceIcon, permission: 'integrations:manage' },
      { name: 'Roles', href: '/settings/roles', icon: ShieldCheckIcon, permission: 'roles:view' },
      { name: 'Activity Logs', href: '/activity-logs', icon: ClockIcon }, // Administrator only (handled in page)
      { name: 'Recycle Bin', href: '/recycle-bin', icon: TrashIcon }, // Administrator only
      { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
    ],
  },
];
