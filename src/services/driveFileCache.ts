import { env } from '../config/env';
import { StudentSubmissionDoc, SubmissionAttachment } from '../types/classroom';

const DRIVE_CACHE_STORAGE_NAME = 'classroom-agent-drive-files-v1';
const PREVIEW_CACHE_PREFIX = 'https://classroom-agent.local/drive-cache/preview/';
const TEXT_CACHE_PREFIX = 'https://classroom-agent.local/drive-cache/text/';

// L1 In-Memory Caches for synchronous 0ms lookup across student/tab/assignment switches
const previewUrlMemoryCache = new Map<string, string>();
const textContentMemoryCache = new Map<string, string>();

// In-flight request deduplication maps
const inFlightPreviewPromises = new Map<string, Promise<string>>();
const inFlightTextPromises = new Map<string, Promise<string>>();

// Failed file tracking so we don't infinitely retry broken Drive file IDs in a tight render loop
const failedPreviewFileIds = new Set<string>();
const failedTextFileIds = new Set<string>();

type CacheListener = () => void;
const listeners = new Set<CacheListener>();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('[DriveFileCache] Listener error:', err);
    }
  });
}

export function subscribeDriveFileCache(listener: CacheListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCachedDrivePreviewUrl(fileId?: string): string | undefined {
  if (!fileId) return undefined;
  return previewUrlMemoryCache.get(fileId);
}

export function getCachedDriveTextContent(fileId?: string): string | undefined {
  if (!fileId) return undefined;
  return textContentMemoryCache.get(fileId);
}

export function isDrivePreviewLoading(fileId?: string): boolean {
  if (!fileId) return false;
  return inFlightPreviewPromises.has(fileId);
}

export function isDriveTextLoading(fileId?: string): boolean {
  if (!fileId) return false;
  return inFlightTextPromises.has(fileId);
}

export function hasDrivePreviewFailed(fileId?: string): boolean {
  if (!fileId) return false;
  return failedPreviewFileIds.has(fileId);
}

export function hasDriveTextFailed(fileId?: string): boolean {
  if (!fileId) return false;
  return failedTextFileIds.has(fileId);
}

async function openBrowserCache(): Promise<Cache | null> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return null;
  }
  try {
    return await window.caches.open(DRIVE_CACHE_STORAGE_NAME);
  } catch {
    return null;
  }
}

export function attachmentNeedsPreviewBlob(att: SubmissionAttachment): boolean {
  if (!att.driveFileId) return false;
  return (
    att.type === 'PDF' ||
    att.type === 'GOOGLE_DOC' ||
    att.type === 'GOOGLE_SLIDES' ||
    att.type === 'GOOGLE_SHEETS' ||
    (att.type === 'IMAGE' && !att.thumbnailUrl)
  );
}

export function attachmentNeedsTextContent(att: SubmissionAttachment): boolean {
  if (!att.driveFileId || att.contentPreview) return false;
  return (
    att.type === 'CODE' ||
    att.type === 'TEXT' ||
    att.type === 'GOOGLE_DOC' ||
    att.type === 'GOOGLE_SHEETS'
  );
}

/**
 * Fetches and caches a Drive file's preview Blob URL (PDF/Image).
 * Uses L1 in-memory Map -> L2 Browser CacheStorage -> Network fetch with deduplication.
 */
export async function fetchDrivePreviewUrl(
  fileId: string,
  getAuthHeaders: () => Promise<Record<string, string>>
): Promise<string> {
  if (!fileId) return '';

  const cachedUrl = previewUrlMemoryCache.get(fileId);
  if (cachedUrl !== undefined) {
    return cachedUrl;
  }

  const existingPromise = inFlightPreviewPromises.get(fileId);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    const cacheKey = `${PREVIEW_CACHE_PREFIX}${encodeURIComponent(fileId)}`;
    try {
      // 1. Check L2 Persistent Browser CacheStorage first
      const diskCache = await openBrowserCache();
      if (diskCache) {
        const cachedRes = await diskCache.match(cacheKey);
        if (cachedRes && cachedRes.ok) {
          const blob = await cachedRes.blob();
          if (blob.size > 0) {
            const blobUrl = URL.createObjectURL(blob);
            previewUrlMemoryCache.set(fileId, blobUrl);
            failedPreviewFileIds.delete(fileId);
            return blobUrl;
          }
        }
      }

      // 2. Fetch from backend Drive file endpoint
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${env.API_BASE_URL}/classroom/drive-file/${encodeURIComponent(fileId)}?exportType=preview`,
        { headers }
      );

      if (!res.ok) {
        failedPreviewFileIds.add(fileId);
        return '';
      }

      const blob = await res.blob();
      if (diskCache && blob.size > 0) {
        try {
          await diskCache.put(
            cacheKey,
            new Response(blob, {
              headers: {
                'Content-Type': blob.type || 'application/pdf',
                'Cache-Control': 'private, max-age=86400',
              },
            })
          );
        } catch {
          // Non-fatal CacheStorage quota or security error
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      previewUrlMemoryCache.set(fileId, blobUrl);
      failedPreviewFileIds.delete(fileId);
      return blobUrl;
    } catch (err) {
      console.error(`[DriveFileCache] Failed to fetch preview for ${fileId}:`, err);
      failedPreviewFileIds.add(fileId);
      return '';
    } finally {
      inFlightPreviewPromises.delete(fileId);
      notifyListeners();
    }
  })();

  inFlightPreviewPromises.set(fileId, promise);
  notifyListeners();
  return promise;
}

/**
 * Fetches and caches a Drive file's extracted text content.
 * Uses L1 in-memory Map -> L2 Browser CacheStorage -> Network fetch with deduplication.
 */
export async function fetchDriveTextContent(
  fileId: string,
  getAuthHeaders: () => Promise<Record<string, string>>
): Promise<string> {
  if (!fileId) return '';

  const cachedText = textContentMemoryCache.get(fileId);
  if (cachedText !== undefined) {
    return cachedText;
  }

  const existingPromise = inFlightTextPromises.get(fileId);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    const cacheKey = `${TEXT_CACHE_PREFIX}${encodeURIComponent(fileId)}`;
    try {
      // 1. Check L2 Persistent Browser CacheStorage first
      const diskCache = await openBrowserCache();
      if (diskCache) {
        const cachedRes = await diskCache.match(cacheKey);
        if (cachedRes && cachedRes.ok) {
          const text = await cachedRes.text();
          textContentMemoryCache.set(fileId, text);
          failedTextFileIds.delete(fileId);
          return text;
        }
      }

      // 2. Fetch from backend Drive file endpoint
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${env.API_BASE_URL}/classroom/drive-file/${encodeURIComponent(fileId)}?exportType=text`,
        { headers }
      );

      if (!res.ok) {
        failedTextFileIds.add(fileId);
        return '';
      }

      const text = await res.text();
      if (diskCache) {
        try {
          await diskCache.put(
            cacheKey,
            new Response(text, {
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'private, max-age=86400',
              },
            })
          );
        } catch {
          // Non-fatal CacheStorage quota or security error
        }
      }

      textContentMemoryCache.set(fileId, text);
      failedTextFileIds.delete(fileId);
      return text;
    } catch (err) {
      console.error(`[DriveFileCache] Failed to fetch text for ${fileId}:`, err);
      failedTextFileIds.add(fileId);
      return '';
    } finally {
      inFlightTextPromises.delete(fileId);
      notifyListeners();
    }
  })();

  inFlightTextPromises.set(fileId, promise);
  notifyListeners();
  return promise;
}

/**
 * Prefetches preview and/or text assets for a single attachment.
 * Preview and text promises resolve independently so PDF rendering never blocks on text extraction.
 */
export async function prefetchAttachmentAssets(
  att: SubmissionAttachment,
  getAuthHeaders: () => Promise<Record<string, string>>
): Promise<void> {
  const fileId = att.driveFileId;
  if (!fileId) return;

  const tasks: Promise<unknown>[] = [];

  if (
    attachmentNeedsPreviewBlob(att) &&
    !previewUrlMemoryCache.has(fileId) &&
    !failedPreviewFileIds.has(fileId)
  ) {
    tasks.push(fetchDrivePreviewUrl(fileId, getAuthHeaders));
  }

  if (
    attachmentNeedsTextContent(att) &&
    !textContentMemoryCache.has(fileId) &&
    !failedTextFileIds.has(fileId)
  ) {
    tasks.push(fetchDriveTextContent(fileId, getAuthHeaders));
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

// Background prefetch queue state
const queuedBackgroundFileIds = new Set<string>();
let activeBackgroundWorkers = 0;
const MAX_BACKGROUND_WORKERS = 2;
const backgroundTaskQueue: Array<() => Promise<void>> = [];

function pumpBackgroundQueue() {
  while (activeBackgroundWorkers < MAX_BACKGROUND_WORKERS && backgroundTaskQueue.length > 0) {
    const nextTask = backgroundTaskQueue.shift();
    if (!nextTask) break;
    activeBackgroundWorkers++;
    nextTask().finally(() => {
      activeBackgroundWorkers--;
      pumpBackgroundQueue();
    });
  }
}

/**
 * Prefetches all attachments (submitted documents + feedback documents) for the active student immediately,
 * and queues background prefetching for all other students in the workspace.
 */
export function prefetchWorkspaceSubmissions(
  submissions: StudentSubmissionDoc[],
  priorityStudentId: string | null,
  getAuthHeaders: () => Promise<Record<string, string>>
): void {
  if (!submissions || submissions.length === 0) return;

  // 1. Immediately prefetch all attachments of the selected student (both submitted docs and feedback docs)
  if (priorityStudentId) {
    const prioritySub = submissions.find((s) => s.studentId === priorityStudentId);
    if (prioritySub?.attachments) {
      for (const att of prioritySub.attachments) {
        if (att.driveFileId) {
          void prefetchAttachmentAssets(att, getAuthHeaders);
        }
      }
    }
  }

  // 2. Enqueue remaining students' attachments for bounded background prefetching
  for (const sub of submissions) {
    if (sub.studentId === priorityStudentId) continue;
    for (const att of sub.attachments || []) {
      const fileId = att.driveFileId;
      if (!fileId || queuedBackgroundFileIds.has(fileId)) continue;

      const needsPreview =
        attachmentNeedsPreviewBlob(att) &&
        !previewUrlMemoryCache.has(fileId) &&
        !failedPreviewFileIds.has(fileId);
      const needsText =
        attachmentNeedsTextContent(att) &&
        !textContentMemoryCache.has(fileId) &&
        !failedTextFileIds.has(fileId);

      if (!needsPreview && !needsText) continue;

      queuedBackgroundFileIds.add(fileId);
      backgroundTaskQueue.push(async () => {
        try {
          await prefetchAttachmentAssets(att, getAuthHeaders);
        } finally {
          queuedBackgroundFileIds.delete(fileId);
        }
      });
    }
  }

  pumpBackgroundQueue();
}
