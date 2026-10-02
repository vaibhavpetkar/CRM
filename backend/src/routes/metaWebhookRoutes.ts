import express, { Router } from 'express';
import { verifyMetaWebhook, receiveMetaWebhook } from '../controllers/metaLeadsController';

// Meta (Facebook) webhook for Lead Ads. Mounted in server.ts BEFORE the
// app-wide JSON parser: the signature check needs the exact raw bytes Meta
// signed, so this route reads the body itself.
const router = Router();

router.get('/', verifyMetaWebhook);
router.post('/', express.raw({ type: '*/*', limit: '1mb' }), receiveMetaWebhook);

export default router;
