import express, { Router } from 'express';
import cors from 'cors';
import { submitWebsiteLead } from '../controllers/websiteLeadController';
import { websiteLeadRateLimiter } from '../middleware/rateLimiter';
import { runWithTenant } from '../tenancy/context';
import { getDefaultCompanyId } from '../tenancy/migration';

// Routes the company website calls without a login. Mounted in server.ts
// BEFORE the app-wide CORS and body parser, so it gets its own CORS policy
// (website origins only, no cookies) and a small body limit.
const websiteOrigins = (
  process.env.WEBSITE_ORIGINS || 'https://inveontechnologies.in,https://www.inveontechnologies.in'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const router = Router();

router.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || websiteOrigins.includes(origin)),
    credentials: false,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);
router.use(express.json({ limit: '20kb' }));

// Website enquiries become leads of WEBSITE_LEADS_COMPANY_ID, or of the
// original (oldest) company when that isn't set.
const asWebsiteCompany: express.RequestHandler = async (_req, _res, next) => {
  try {
    const companyId = Number(process.env.WEBSITE_LEADS_COMPANY_ID) || (await getDefaultCompanyId());
    runWithTenant(companyId, () => next());
  } catch (err) {
    next(err);
  }
};

router.post('/website-leads', websiteLeadRateLimiter, asWebsiteCompany, submitWebsiteLead);

export default router;
