import type { ComponentType } from 'react';
import {
  HomeIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  UsersIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  ReceiptPercentIcon,
  CheckCircleIcon,
  CalendarDaysIcon,
  MegaphoneIcon,
  EnvelopeIcon,
  DocumentDuplicateIcon,
  PresentationChartLineIcon,
  ViewColumnsIcon,
  BuildingOffice2Icon,
  ClockIcon,
  TrashIcon,
  CubeIcon,
  TagIcon,
  ReceiptRefundIcon,
  PuzzlePieceIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

export type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Permission key required to see/access this item. Omit for items open to every logged-in user. */
  permission?: string;
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
      { name: 'My Profile', href: '/settings?tab=profile', icon: UserCircleIcon },
      { name: 'Reports', href: '/reports', icon: ChartBarIcon, permission: 'reports:view' },
      { name: 'Analytics', href: '/marketing/analytics', icon: PresentationChartLineIcon, permission: 'marketing:view' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { name: 'Leads', href: '/leads', icon: ClipboardDocumentListIcon, permission: 'leads:read' },
      { name: 'Quotes', href: '/quotes', icon: DocumentTextIcon, permission: 'quotes:view' },
      { name: 'Tasks', href: '/tasks', icon: CheckCircleIcon, permission: 'tasks:view' },
      { name: 'Meetings', href: '/meetings', icon: CalendarDaysIcon, permission: 'meetings:view' },
      { name: 'Invoices', href: '/invoices', icon: ReceiptPercentIcon, permission: 'invoices:view' },
      { name: 'Pipeline', href: '/pipeline', icon: ViewColumnsIcon, permission: 'deals:read' },
      { name: 'Contacts', href: '/contacts', icon: UserGroupIcon, permission: 'contacts:read' },
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
      { name: 'Tax Master', href: '/items/taxes', icon: ReceiptRefundIcon, permission: 'taxes:read' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { name: 'Team', href: '/team', icon: UsersIcon, permission: 'users:read' },
      { name: 'Company', href: '/settings/company', icon: BuildingOffice2Icon, permission: 'company:manage' },
      { name: 'Integrations', href: '/settings/integrations', icon: PuzzlePieceIcon, permission: 'integrations:manage' },
      { name: 'Roles', href: '/settings/roles', icon: ShieldCheckIcon, permission: 'roles:view' },
      { name: 'Activity Logs', href: '/activity-logs', icon: ClockIcon }, // Administrator only (handled in page)
      { name: 'Recycle Bin', href: '/recycle-bin', icon: TrashIcon }, // Administrator only
      { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
    ],
  },
];
