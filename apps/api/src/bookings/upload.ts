import { randomUUID } from 'node:crypto';
import { Router, type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { AUTH_COOKIE, verifySession } from '../auth/tokens.js';
import type { Env } from '../config.js';
import type { Db } from '../db.js';
import { publishTripEvent } from '../graphql/pubsub.js';
import type { Storage } from '../storage.js';
import { parseFile, sniff } from './parse/index.js';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Keeps a readable, path-safe file name. */
export const safeFileName = (name: string) =>
  name
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex -- control characters are exactly what we strip
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'document';

/**
 * POST /api/trips/:tripId/attachments  (multipart, field "file", one file per request)
 * Stores the file privately and returns any bookings found in it. Editors and owners only.
 */
export function uploadRouter(env: Env, db: Db, storage: Storage) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  router.post('/api/trips/:tripId/attachments', upload.single('file'), async (req, res) => {
    const userId = verifySession(req.cookies?.[AUTH_COOKIE] as string | undefined, env.JWT_SECRET);
    if (!userId) {
      res.status(401).json({ error: 'You must be signed in.' });
      return;
    }
    const tripId = String(req.params.tripId);
    const member = await db.tripMember
      .findUnique({ where: { tripId_userId: { tripId, userId } } })
      .catch(() => null);
    if (!member || member.role === 'VIEWER') {
      res.status(403).json({ error: 'You can’t add documents to this trip.' });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Choose a file to upload.' });
      return;
    }
    const detected = sniff(file.buffer);
    if (!detected) {
      res.status(415).json({ error: 'Only PDF, email (.eml), PNG and JPG files are supported.' });
      return;
    }

    const fileName = safeFileName(Buffer.from(file.originalname, 'latin1').toString('utf8'));
    const storageKey = `trips/${tripId}/${randomUUID()}/${fileName}`;
    await storage.put(storageKey, file.buffer, detected.mime);
    const attachment = await db.attachment.create({
      data: {
        tripId,
        uploadedById: userId,
        fileName,
        mimeType: detected.mime,
        sizeBytes: file.size,
        storageKey,
      },
    });
    const drafts = await parseFile(file.buffer, detected.kind, fileName);
    await publishTripEvent(tripId, 'BOOKING_CHANGED', { actorId: userId });

    res.status(201).json({
      attachment: { id: attachment.id, fileName, mimeType: detected.mime, sizeBytes: file.size },
      kind: detected.kind,
      drafts: drafts.map((d) => ({
        ...d,
        source: detected.kind,
        attachmentId: attachment.id,
        sourceName: fileName,
      })),
    });
  });

  const onError: ErrorRequestHandler = (err, _req, res, next) => {
    if (err instanceof multer.MulterError) {
      res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Files can be up to 15 MB.' : err.message,
      });
      return;
    }
    next(err);
  };
  router.use(onError);
  return router;
}
