import { Response } from 'express';
import Integration from '../models/Integration';
import { AuthRequest } from '../middleware/authMiddleware';

// Static catalog of every integration this CRM is built to support (Phases
// 13-19 of the requirement doc). Deliberately NOT implemented against the
// real provider APIs yet — every one of them needs credentials this
// environment doesn't have. This catalog + the endpoints below are the
// scalable shell those integrations plug into once credentials exist: each
// provider already has a real connection state, real env-var detection, and
// a real (not faked) connect/disconnect flow — just no live OAuth exchange
// yet, which is called out honestly in `connect` rather than pretended.
interface ProviderDef {
  key: string;
  label: string;
  category: 'social' | 'local-business' | 'professional' | 'scheduling' | 'video' | 'marketing';
  description: string;
  // Backend env vars that must be set before a real connect is possible.
  // Never sent to the frontend beyond their names — values stay server-side.
  requiredEnvVars: string[];
  docsUrl?: string;
}

export const PROVIDER_CATALOG: ProviderDef[] = [
  {
    key: 'meta',
    label: 'Meta (Facebook, Instagram & WhatsApp Business)',
    category: 'social',
    description: 'Sync leads from Facebook/Instagram ads and send messages via WhatsApp Business API.',
    requiredEnvVars: ['META_APP_ID', 'META_APP_SECRET'],
    docsUrl: 'https://developers.facebook.com/docs',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    category: 'professional',
    description: 'B2B lead and company workflows for professional-services teams.',
    requiredEnvVars: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    docsUrl: 'https://learn.microsoft.com/linkedin/',
  },
  {
    key: 'calendly',
    label: 'Calendly',
    category: 'scheduling',
    description: 'Turn Calendly bookings into CRM Contacts, Activities, and Deals automatically.',
    requiredEnvVars: ['CALENDLY_API_KEY'],
    docsUrl: 'https://developer.calendly.com',
  },
  {
    key: 'mailchimp',
    label: 'Mailchimp',
    category: 'marketing',
    description: 'Sync CRM contacts into a Mailchimp audience for email marketing campaigns.',
    requiredEnvVars: ['MAILCHIMP_API_KEY', 'MAILCHIMP_SERVER_PREFIX'],
    docsUrl: 'https://mailchimp.com/developer/',
  },
  // Google Meet and Google Business Profile are NOT in this catalog — they
  // have real, dedicated OAuth flows (googleMeetController/Routes and
  // googleBusinessController/Routes) instead of the generic
  // credentials-configured-but-not-implemented stub below. See the
  // Integrations page, which renders them as separate real cards.
];

const findProvider = (key: string) => PROVIDER_CATALOG.find((p) => p.key === key);

const credentialsPresent = (provider: ProviderDef) =>
  provider.requiredEnvVars.every((name) => !!process.env[name] && process.env[name]!.trim() !== '');

export const getIntegrations = async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await Integration.findAll();
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    const result = PROVIDER_CATALOG.map((provider) => {
      const row = byProvider.get(provider.key);
      const missingEnvVars = provider.requiredEnvVars.filter((name) => !process.env[name] || process.env[name]!.trim() === '');
      return {
        provider: provider.key,
        label: provider.label,
        category: provider.category,
        description: provider.description,
        docsUrl: provider.docsUrl || null,
        credentialsConfigured: missingEnvVars.length === 0,
        missingEnvVars,
        status: row?.status || 'not_configured',
        isEnabled: row?.isEnabled || false,
        connectedAt: row?.connectedAt || null,
        lastSyncAt: row?.lastSyncAt || null,
        lastError: row?.lastError || null,
      };
    });

    return res.json({ integrations: result });
  } catch (error) {
    console.error('Get integrations error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const connectIntegration = async (req: AuthRequest, res: Response) => {
  try {
    const provider = findProvider(req.params.provider);
    if (!provider) {
      return res.status(404).json({ message: `Unknown integration '${req.params.provider}'.` });
    }

    if (!credentialsPresent(provider)) {
      const missing = provider.requiredEnvVars.filter((name) => !process.env[name] || process.env[name]!.trim() === '');
      return res.status(400).json({
        message: `${provider.label} isn't connected — missing backend credentials: ${missing.join(', ')}. Set these in the server environment first.`,
        missingEnvVars: missing,
      });
    }

    // Credentials exist, but the OAuth/token-exchange flow for this provider
    // hasn't been implemented yet — we do not fake a successful connection.
    return res.status(501).json({
      message: `${provider.label} credentials are configured, but the connection flow for this provider isn't implemented yet.`,
    });
  } catch (error) {
    console.error('Connect integration error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const disconnectIntegration = async (req: AuthRequest, res: Response) => {
  try {
    const provider = findProvider(req.params.provider);
    if (!provider) {
      return res.status(404).json({ message: `Unknown integration '${req.params.provider}'.` });
    }

    const row = await Integration.findOne({ where: { provider: provider.key } });
    if (row) {
      await row.update({
        status: 'not_configured',
        isEnabled: false,
        connectedById: null,
        connectedAt: null,
        lastError: null,
      });
    }

    return res.json({ message: `${provider.label} disconnected.` });
  } catch (error) {
    console.error('Disconnect integration error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
