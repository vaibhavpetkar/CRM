import express, { Router } from 'express';
import { receiveVoiceWebhook } from '../controllers/callController';

// Call status webhooks from the telephony provider (Exotel sends JSON or form
// fields). Mounted in server.ts before the app-wide CORS/JSON middleware. The
// secret per-call token in the URL is what authenticates the request.
const router = Router();

router.post(
  '/:token',
  express.json({ limit: '200kb' }),
  express.urlencoded({ extended: true, limit: '200kb' }),
  receiveVoiceWebhook
);

export default router;
