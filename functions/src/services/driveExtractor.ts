import { getDriveClient } from './classroomClient';

export interface ExtractedFileContent {
  mimeType: string;
  name: string;
  textContent?: string;
  buffer?: Buffer;
  previewUrl?: string;
}

export async function extractDriveFile(
  accessToken: string,
  fileId: string,
  exportType: 'text' | 'preview' | 'raw' = 'text'
): Promise<ExtractedFileContent> {
  const drive = getDriveClient(accessToken);

  // 1. Get file metadata
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, webViewLink, thumbnailLink',
  });

  const mimeType = meta.data.mimeType || 'application/octet-stream';
  const name = meta.data.name || 'document';

  // 2. Handle Google Workspace Document Types (Docs, Slides, Sheets)
  if (mimeType.startsWith('application/vnd.google-apps.')) {
    if (mimeType === 'application/vnd.google-apps.document') {
      if (exportType === 'preview') {
        const res = await drive.files.export(
          { fileId, mimeType: 'application/pdf' },
          { responseType: 'arraybuffer' }
        );
        return {
          name,
          mimeType: 'application/pdf',
          buffer: Buffer.from(res.data as ArrayBuffer),
        };
      } else {
        const res = await drive.files.export(
          { fileId, mimeType: 'text/plain' },
          { responseType: 'text' }
        );
        return {
          name,
          mimeType: 'text/plain',
          textContent: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
        };
      }
    }

    if (mimeType === 'application/vnd.google-apps.presentation') {
      const res = await drive.files.export(
        { fileId, mimeType: 'application/pdf' },
        { responseType: 'arraybuffer' }
      );
      return {
        name,
        mimeType: 'application/pdf',
        buffer: Buffer.from(res.data as ArrayBuffer),
        textContent: `[Google Slides Presentation: "${name}"] (Exported as PDF)`,
      };
    }

    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      if (exportType === 'preview') {
        const res = await drive.files.export(
          { fileId, mimeType: 'application/pdf' },
          { responseType: 'arraybuffer' }
        );
        return {
          name,
          mimeType: 'application/pdf',
          buffer: Buffer.from(res.data as ArrayBuffer),
        };
      } else {
        const res = await drive.files.export(
          { fileId, mimeType: 'text/csv' },
          { responseType: 'text' }
        );
        return {
          name,
          mimeType: 'text/csv',
          textContent: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
        };
      }
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
    return {
      name,
      mimeType: 'text/plain',
      textContent: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
    };
  }

  // Binary files (PDFs, Images, etc.)
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return {
    name,
    mimeType,
    buffer: Buffer.from(res.data as ArrayBuffer),
    textContent: mimeType === 'application/pdf' ? `[PDF File: "${name}"]` : `[Image File: "${name}"]`,
  };
}
