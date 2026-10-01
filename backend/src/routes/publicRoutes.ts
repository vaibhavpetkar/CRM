import express, { Router } from 'express';
import cors from 'cors';
import { submitWebsiteLead } from '../controllers/websiteLeadController';
import { websiteLeadRateLimiter } from '../middleware/rateLimiter';

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

router.post('/website-leads', websiteLeadRateLimiter, submitWebsiteLead);

export default router;
