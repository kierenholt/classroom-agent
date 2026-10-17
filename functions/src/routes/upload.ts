import { Router, Response } from 'express';
import * as admin from 'firebase-admin';
import Busboy from 'busboy';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

export const uploadRouter = Router();

uploadRouter.post('/', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const busboy = Busboy({ headers: req.headers });
  let uploadPromise: Promise<{ uri: string; filename: string; mimeType: string }> | null = null;
  let assignmentId = 'general';

  busboy.on('field', (fieldname, val) => {
    if (fieldname === 'assignmentId') {
      assignmentId = val;
    }
  });

  busboy.on('file', (_fieldname, fileStream, fileInfo) => {
    const { filename, mimeType } = fileInfo;
    const safeFilename = filename || 'attachment';
    const bucket = admin.storage().bucket();
    const destination = `uploads/${assignmentId}/${Date.now()}_${safeFilename}`;
    const file = bucket.file(destination);

    const writeStream = file.createWriteStream({
      metadata: {
        contentType: mimeType,
      },
    });

    uploadPromise = new Promise((resolve, reject) => {
      fileStream.pipe(writeStream)
        .on('finish', () => {
          resolve({
            uri: `gs://${bucket.name}/${destination}`,
            filename: safeFilename,
            mimeType,
          });
        })
        .on('error', reject);
    });
  });

  busboy.on('finish', async () => {
    if (!uploadPromise) {
      res.status(400).json({ error: 'No file provided in upload.' });
      return;
    }

    try {
      const result = await uploadPromise;
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: `Upload failed: ${err.message}` });
    }
  });

  busboy.on('error', (err: any) => {
    res.status(500).json({ error: `Busboy error: ${err.message}` });
  });

  req.pipe(busboy);
});
