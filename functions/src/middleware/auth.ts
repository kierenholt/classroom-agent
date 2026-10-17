import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';

export interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
  googleAccessToken?: string;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: '[Auth Failure] Missing or malformed Authorization header. Expected Bearer <firebaseIdToken>. Fail-fast enabled.',
    });
    return;
  }

  const googleAccessToken = req.headers['x-google-access-token'];
  if (!googleAccessToken || typeof googleAccessToken !== 'string' || googleAccessToken.trim() === '') {
    res.status(401).json({
      error: '[Auth Failure] Missing mandatory X-Google-Access-Token header. Google Classroom OAuth access is required.',
    });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1].trim();
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    req.googleAccessToken = googleAccessToken.trim();
    next();
  } catch (err: any) {
    res.status(401).json({
      error: `[Auth Failure] Invalid Firebase ID token: ${err.message}`,
    });
  }
}
