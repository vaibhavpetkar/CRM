import express, { Router } from 'express';
import { receivePortalLeads } from '../controllers/salesController';

// Property portals push enquiries here (99acres, MagicBricks, Housing.com).
// Mounted in server.ts before the app-wide CORS/JSON middleware; the secret
// token in the URL identifies the company. Bodies may be JSON, form fields or
// XML, so anything that isn't JSON/form is read as text.
const router = Router();

const parsers = [
  express.json({ limit: '2mb' }),
  express.urlencoded({ extended: true, limit: '2mb' }),
  express.text({ type: ['text/*', 'application/xml', 'application/*+xml'], limit: '2mb' }),
];

router.get('/:source/:token', receivePortalLeads);
router.post('/:source/:token', ...parsers, receivePortalLeads);

export default router;
