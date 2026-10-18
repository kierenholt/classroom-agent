import { getDriveClient } from './classroomClient';

export interface ExtractedFileContent {
  mimeType: string;
  name: string;
  textContent?: string;
  buffer?: Buffer;
  previewUrl?: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 100;

interface CachedMeta {
  name: string;
  mimeType: string;
  timestamp: number;
}

interface CachedExtraction {
  data: ExtractedFileContent;
  timestamp: number;
}

const fileMetadataCache = new Map<string, CachedMeta>();
const extractedContentCache = new Map<string, CachedExtraction>();
const inFlightMetaPromises = new Map<string, Promise<{ name: string; mimeType: string }>>();
const inFlightExtractionPromises = new Map<string, Promise<ExtractedFileContent>>();

function pruneCacheIfNeeded<T>(cache: Map<string, { timestamp: number } & T>) {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

async function getFileMetadataCached(
  accessToken: string,
  fileId: string
): Promise<{ name: string; mimeType: string }> {
  const cached = fileMetadataCache.get(fileId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { name: cached.name, mimeType: cached.mimeType };
  }

  const inFlight = inFlightMetaPromises.get(fileId);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    try {
      const drive = getDriveClient(accessToken);
      const meta = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, webViewLink, thumbnailLink',
      });
      const mimeType = meta.data.mimeType || 'application/octet-stream';
      const name = meta.data.name || 'document';
      fileMetadataCache.set(fileId, { name, mimeType, timestamp: Date.now() });
      pruneCacheIfNeeded(fileMetadataCache);
      return { name, mimeType };
    } finally {
      inFlightMetaPromises.delete(fileId);
    }
  })();

  inFlightMetaPromises.set(fileId, promise);
  return promise;
}

export async function extractDriveFile(
  accessToken: string,
  fileId: string,
  exportType: 'text' | 'preview' | 'raw' = 'text'
): Promise<ExtractedFileContent> {
  const cacheKey = `${fileId}:${exportType}`;
  const cached = extractedContentCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const inFlight = inFlightExtractionPromises.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async (): Promise<ExtractedFileContent> => {
    try {
      const drive = getDriveClient(accessToken);
      const { name, mimeType } = await getFileMetadataCached(accessToken, fileId);

      let result: ExtractedFileContent;

      // 2. Handle Google Workspace Document Types (Docs, Slides, Sheets)
      if (mimeType.startsWith('application/vnd.google-apps.')) {
        if (mimeType === 'application/vnd.google-apps.document') {
          if (exportType === 'preview') {
            const res = await drive.files.export(
              { fileId, mimeType: 'application/pdf' },
              { responseType: 'arraybuffer' }
            );
            result = {
              name,
              mimeType: 'application/pdf',
              buffer: Buffer.from(res.data as ArrayBuffer),
            };
          } else {
            const res = await drive.files.export(
              { fileId, mimeType: 'text/plain' },
              { responseType: 'text' }
            );
            result = {
              name,
              mimeType: 'text/plain',
              textContent: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
            };
          }
          extractedContentCache.set(cacheKey, { data: result, timestamp: Date.now() });
          pruneCacheIfNeeded(extractedContentCache);
          return result;
        }

        if (mimeType === 'application/vnd.google-apps.presentation') {
          const res = await drive.files.export(
            { fileId, mimeType: 'application/pdf' },
            { responseType: 'arraybuffer' }
          );
          result = {
            name,
            mimeType: 'application/pdf',
            buffer: Buffer.from(res.data as ArrayBuffer),
            textContent: `[Google Slides Presentation: "${name}"] (Exported as PDF)`,
          };
          extractedContentCache.set(cacheKey, { data: result, timestamp: Date.now() });
          pruneCacheIfNeeded(extractedContentCache);
          return result;
        }

        if (mimeType === 'application/vnd.google-apps.spreadsheet') {
          if (exportType === 'preview') {
            const res = await drive.files.export(
              { fileId, mimeType: 'application/pdf' },
              { responseType: 'arraybuffer' }
            );
            result = {
              name,
              mimeType: 'application/pdf',
              buffer: Buffer.from(res.data as ArrayBuffer),
            };
          } else {
            const res = await drive.files.export(
              { fileId, mimeType: 'text/csv' },
              { responseType: 'text' }
            );
            result = {
              name,
              mimeType: 'text/csv',
              textContent: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
            };
          }
          extractedContentCache.set(cacheKey, { data: result, timestamp: Date.now() });
          pruneCacheIfNeeded(extractedContentCache);
          return result;
        }
      }

      // 3. Handle standard files (PDF, Code, Text, Images)
      if (
        mimeType.startsWith('text/') ||
        mimeType === 'application/json' ||
        mimeType === 'application/javascript' ||
        mimeType === 'application/typescript' ||
        name.endsWith('.py') ||
        name.endsWith('.js') ||
        name.endsWith('.ts') ||
        name.endsWith('.java') ||
        name.endsWith('.cpp') ||
        name.endsWith('.cs') ||
        name.endsWith('.md')
      ) {
        const res = await drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'text' }
        );
        result = {
          name,
          mimeType: 'text/plain',
          textContent: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
        };
        extractedContentCache.set(cacheKey, { data: result, timestamp: Date.now() });
        pruneCacheIfNeeded(extractedContentCache);
        return result;
      }

      // Binary files (PDFs, Images, etc.)
      const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      result = {
        name,
        mimeType,
        buffer: Buffer.from(res.data as ArrayBuffer),
        textContent: mimeType === 'application/pdf' ? `[PDF File: "${name}"]` : `[Image File: "${name}"]`,
      };
      extractedContentCache.set(cacheKey, { data: result, timestamp: Date.now() });
      pruneCacheIfNeeded(extractedContentCache);
      return result;
    } finally {
      inFlightExtractionPromises.delete(cacheKey);
    }
  })();

  inFlightExtractionPromises.set(cacheKey, promise);
  return promise;
}
