import express, { Router } from 'express';
import { receiveVoiceWebhook } from '../controllers/callController';
import { receiveIncomingCallWebhook, routeIncomingCallWebhook } from '../controllers/salesController';

// Call status webhooks from the telephony provider (Exotel sends JSON or form
// fields). Mounted in server.ts before the app-wide CORS/JSON middleware. The
// secret per-call token in the URL is what authenticates the request.
const router = Router();

// Incoming call events (ringing, answered, ended, recording) for the company
// whose secret token this is. Some providers send them as a GET query string.
const parseBody = [
  express.json({ limit: '200kb' }),
  express.urlencoded({ extended: true, limit: '200kb' }),
  // An AES-encrypted body (Vi CPaaS) arrives as plain text.
  express.text({ type: ['text/*', 'application/octet-stream'], limit: '200kb' }),
];

// Rotational calling for incoming calls: the provider asks who to ring (the
// sales person a returning caller last spoke to, else whose turn it is).
// Before /:token so "rotation" isn't read as a call token.
router.get('/rotation/:token', routeIncomingCallWebhook);
router.post('/rotation/:token', ...parseBody, routeIncomingCallWebhook);

router.get('/incoming/:token', receiveIncomingCallWebhook);
router.post('/incoming/:token', ...parseBody, receiveIncomingCallWebhook);

router.post('/:token', ...parseBody, receiveVoiceWebhook);

export default router;
