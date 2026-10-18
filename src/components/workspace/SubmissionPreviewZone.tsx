import React, { useState, useEffect, useMemo } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Link as LinkIcon, FileCode, Eye, Loader2, Video, Music, FileArchive, MessageSquare } from 'lucide-react';
import { StudentSubmissionDoc, SubmissionAttachment } from '../../types/classroom';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import {
  subscribeDriveFileCache,
  getCachedDrivePreviewUrl,
  getCachedDriveTextContent,
  isDrivePreviewLoading,
  isDriveTextLoading,
  attachmentNeedsPreviewBlob,
  prefetchAttachmentAssets,
  prefetchWorkspaceSubmissions,
} from '../../services/driveFileCache';

// Dedicated SVG icons for Google Workspace and common document formats
const GoogleDocIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.5 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2z" fill="#4285F4" />
    <path d="M14 2v6h6l-6-6z" fill="#A1C2FA" />
    <path d="M7.5 12h9v1.5h-9zm0 3h9v1.5h-9zm0-6h5v1.5h-5z" fill="#FFFFFF" />
  </svg>
);

const GoogleSheetsIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.5 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2z" fill="#0F9D58" />
    <path d="M14 2v6h6l-6-6z" fill="#87CEAC" />
    <rect x="7" y="10" width="10" height="8" rx="0.5" fill="#FFFFFF" />
    <rect x="7.8" y="10.8" width="3.8" height="2.8" fill="#0F9D58" />
    <rect x="12.4" y="10.8" width="3.8" height="2.8" fill="#0F9D58" />
    <rect x="7.8" y="14.4" width="3.8" height="2.8" fill="#0F9D58" />
    <rect x="12.4" y="14.4" width="3.8" height="2.8" fill="#0F9D58" />
  </svg>
);

const GoogleSlidesIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.5 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2z" fill="#F4B400" />
    <path d="M14 2v6h6l-6-6z" fill="#FAD980" />
    <rect x="7" y="10" width="10" height="7.5" rx="0.8" fill="#FFFFFF" />
    <rect x="8.5" y="11.5" width="7" height="4.5" rx="0.4" fill="#F4B400" />
  </svg>
);

const GoogleFormsIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.5 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2z" fill="#7248B9" />
    <path d="M14 2v6h6l-6-6z" fill="#BAA4E0" />
    <circle cx="8" cy="11.5" r="0.9" fill="#FFFFFF" />
    <rect x="10.2" y="11" width="5.8" height="1" rx="0.5" fill="#FFFFFF" />
    <circle cx="8" cy="14.5" r="0.9" fill="#FFFFFF" />
    <rect x="10.2" y="14" width="5.8" height="1" rx="0.5" fill="#FFFFFF" />
    <circle cx="8" cy="17.5" r="0.9" fill="#FFFFFF" />
    <rect x="10.2" y="17" width="5.8" height="1" rx="0.5" fill="#FFFFFF" />
  </svg>
);

const PdfIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.5 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2z" fill="#EA4335" />
    <path d="M14 2v6h6l-6-6z" fill="#F5A39B" />
    <text x="12" y="16.5" textAnchor="middle" fill="#FFFFFF" fontSize="6.5" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">PDF</text>
  </svg>
);

const WordDocIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.5 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2z" fill="#2B579A" />
    <path d="M14 2v6h6l-6-6z" fill="#88A7D9" />
    <text x="12" y="16.8" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">W</text>
  </svg>
);

const ExcelIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.5 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2z" fill="#217346" />
    <path d="M14 2v6h6l-6-6z" fill="#80C79D" />
    <text x="12" y="16.8" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">X</text>
  </svg>
);

const PowerPointIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.5 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2z" fill="#D24726" />
    <path d="M14 2v6h6l-6-6z" fill="#F09B86" />
    <text x="12" y="16.8" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">P</text>
  </svg>
);

interface SubmissionPreviewZoneProps {
  submission: StudentSubmissionDoc | null;
  allSubmissions?: StudentSubmissionDoc[];
  children?: React.ReactNode;
}

function isPdfPreviewType(type?: SubmissionAttachment['type']): boolean {
  return (
    type === 'PDF' ||
    type === 'GOOGLE_DOC' ||
    type === 'GOOGLE_SLIDES' ||
    type === 'GOOGLE_SHEETS'
  );
}

export const SubmissionPreviewZone: React.FC<SubmissionPreviewZoneProps> = ({
  submission,
  allSubmissions,
  children,
}) => {
  const { getAuthHeaders } = useAuth();
  const { showExtractedTextToggle, showRubricPane } = useSettings();
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');
  const [cacheVersion, setCacheVersion] = useState(0);
  const [mountedPdfFrames, setMountedPdfFrames] = useState<
    Record<string, { fileId: string; title: string; pdfSrc: string }>
  >({});

  // Subscribe to global Drive file cache updates
  useEffect(() => {
    return subscribeDriveFileCache(() => {
      setCacheVersion((v) => v + 1);
    });
  }, []);

  const attachments = submission?.attachments || [];
  const currentAttachment: SubmissionAttachment | undefined =
    attachments[activeAttachmentIndex] || attachments[0];

  // Reset active attachment index when student changes
  useEffect(() => {
    setActiveAttachmentIndex(0);
    setViewMode('rendered');
  }, [submission?.studentId]);

  // Reset to rendered view if the Extracted Text toggle is disabled in settings
  useEffect(() => {
    if (!showExtractedTextToggle) {
      setViewMode('rendered');
    }
  }, [showExtractedTextToggle]);

  // Immediately prefetch active attachment and all attachments (submitted + feedback docs) for the active student
  useEffect(() => {
    if (!submission?.attachments || submission.attachments.length === 0) return;
    for (const att of submission.attachments) {
      if (att.driveFileId) {
        void prefetchAttachmentAssets(att, getAuthHeaders);
      }
    }
  }, [submission?.studentId, submission?.attachments, getAuthHeaders]);

  // Prefetch all other students' submitted documents and feedback documents in background
  useEffect(() => {
    if (!allSubmissions || allSubmissions.length === 0) return;
    prefetchWorkspaceSubmissions(allSubmissions, submission?.studentId || null, getAuthHeaders);
  }, [allSubmissions, submission?.studentId, getAuthHeaders]);

  // Keep a persistent map of all resolved PDF/Doc preview frames so switching tabs or students never reloads iframes
  useEffect(() => {
    const candidateSubmissions = allSubmissions && allSubmissions.length > 0
      ? allSubmissions
      : submission
      ? [submission]
      : [];

    setMountedPdfFrames((prev) => {
      let next: Record<string, { fileId: string; title: string; pdfSrc: string }> | null = null;
      for (const sub of candidateSubmissions) {
        for (const att of sub.attachments || []) {
          if (!att.driveFileId || !isPdfPreviewType(att.type)) continue;
          const cachedUrl = getCachedDrivePreviewUrl(att.driveFileId);
          if (!cachedUrl) continue;
          const pdfSrc = cachedUrl.includes('#')
            ? cachedUrl
            : `${cachedUrl}#toolbar=0&navpanes=0`;
          const existing = (next || prev)[att.driveFileId];
          if (!existing || existing.pdfSrc !== pdfSrc || existing.title !== att.title) {
            if (!next) next = { ...prev };
            next[att.driveFileId] = {
              fileId: att.driveFileId,
              title: att.title,
              pdfSrc,
            };
          }
        }
      }
      return next || prev;
    });
  }, [submission, allSubmissions, cacheVersion]);

  const mountedPdfFramesList = useMemo(() => Object.values(mountedPdfFrames), [mountedPdfFrames]);

  if (!submission) {
    return (
      <div
        data-testid="submission-preview-container"
        className="flex-1 h-full flex flex-col border-r border-[#333842] bg-[#121316] text-gray-500 text-sm select-none overflow-hidden"
      >
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6">
          <FileText className="w-10 h-10 mb-2 text-gray-600" />
          <p>Select a student from the roster to inspect their submission</p>
        </div>
        {showRubricPane && children}
      </div>
    );
  }

  const getAttachmentIcon = (att: SubmissionAttachment) => {
    const type = att.type;
    const title = (att.title || '').toLowerCase();
    const link = (att.alternateLink || '').toLowerCase();

    // 1. Google Workspace Document types
    if (type === 'GOOGLE_DOC' || link.includes('/document/') || title.endsWith('.gdoc')) {
      return <GoogleDocIcon />;
    }
    if (type === 'GOOGLE_SHEETS' || link.includes('/spreadsheets/') || title.endsWith('.gsheet')) {
      return <GoogleSheetsIcon />;
    }
    if (type === 'GOOGLE_SLIDES' || link.includes('/presentation/') || title.endsWith('.gslides')) {
      return <GoogleSlidesIcon />;
    }
    if (link.includes('/forms/') || title.endsWith('.gform')) {
      return <GoogleFormsIcon />;
    }

    // 2. Microsoft Office types
    if (title.endsWith('.docx') || title.endsWith('.doc') || title.endsWith('.odt')) {
      return <WordDocIcon />;
    }
    if (title.endsWith('.xlsx') || title.endsWith('.xls') || title.endsWith('.csv') || title.endsWith('.tsv')) {
      return <ExcelIcon />;
    }
    if (title.endsWith('.pptx') || title.endsWith('.ppt') || title.endsWith('.key') || title.endsWith('.odp')) {
      return <PowerPointIcon />;
    }

    // 3. PDF
    if (type === 'PDF' || title.endsWith('.pdf')) {
      return <PdfIcon />;
    }

    // 4. Code files
    if (
      type === 'CODE' ||
      /\.(py|js|ts|jsx|tsx|html|css|json|java|c|cpp|h|cs|go|rs|rb|php|sh|yaml|yml|sql|md)$/i.test(title)
    ) {
      return <FileCode className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    }

    // 5. Images
    if (type === 'IMAGE' || /\.(png|jpe?g|webp|gif|svg|bmp|tiff)$/i.test(title)) {
      return <ImageIcon className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
    }

    // 6. Videos
    if (/\.(mp4|mov|avi|webm|mkv|wmv)$/i.test(title)) {
      return <Video className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    }

    // 7. Audio
    if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(title)) {
      return <Music className="w-3.5 h-3.5 text-violet-400 shrink-0" />;
    }

    // 8. Archives
    if (/\.(zip|tar|gz|7z|rar|bz2)$/i.test(title)) {
      return <FileArchive className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }

    // 9. Short Answer
    if (type === 'SHORT_ANSWER') {
      return <MessageSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    }

    // 10. Links
    if (type === 'LINK') {
      return <LinkIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    }

    // 11. Fallback text or generic file
    return <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
  };

  const currentFileId = currentAttachment?.driveFileId;

  const resolvedTextContent =
    currentAttachment?.contentPreview ||
    (currentFileId ? getCachedDriveTextContent(currentFileId) : undefined);

  const resolvedPreviewUrl = currentFileId
    ? getCachedDrivePreviewUrl(currentFileId)
    : undefined;

  const needsTextForCurrentView =
    currentAttachment &&
    (viewMode === 'raw' ||
      currentAttachment.type === 'CODE' ||
      currentAttachment.type === 'TEXT');

  const isLoadingCurrentFile = Boolean(
    currentAttachment &&
      currentFileId &&
      (needsTextForCurrentView
        ? resolvedTextContent === undefined && isDriveTextLoading(currentFileId)
        : attachmentNeedsPreviewBlob(currentAttachment)
        ? resolvedPreviewUrl === undefined && isDrivePreviewLoading(currentFileId)
        : false)
  );

  const showActivePdfFrame = Boolean(
    attachments.length > 0 &&
      currentAttachment &&
      currentFileId &&
      !isLoadingCurrentFile &&
      !(viewMode === 'raw' && resolvedTextContent) &&
      isPdfPreviewType(currentAttachment.type) &&
      resolvedPreviewUrl
  );

  return (
    <div
      data-testid="submission-preview-container"
      className="flex-1 h-full flex flex-col border-r border-[#333842] bg-[#121316] select-none text-xs overflow-hidden"
    >
      {/* Top Attachment Switcher Header */}
      <div className="h-10 border-b border-[#333842] bg-[#1A1D21] px-3 flex items-center justify-between shrink-0">
        {/* Attachment Tabs */}
        <div data-testid="attachment-switcher" className="flex items-center space-x-1 overflow-x-auto max-w-[70%]">
          {attachments.length === 0 ? (
            <span className="text-gray-500 italic">No attachments submitted</span>
          ) : (
            attachments.map((att, idx) => {
              const isActive = idx === activeAttachmentIndex;
              return (
                <button
                  key={att.id || idx}
                  data-testid={`attachment-tab-${att.id || idx}`}
                  onMouseEnter={() => {
                    if (att.driveFileId) {
                      void prefetchAttachmentAssets(att, getAuthHeaders);
                    }
                  }}
                  onClick={() => {
                    setActiveAttachmentIndex(idx);
                    setViewMode('rendered');
                  }}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs transition-colors shrink-0 ${
                    isActive
                      ? 'bg-[#22262C] text-[#EDEDED] font-medium border-b-2 border-b-[#D4AF37]'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#22262C]'
                  }`}
                >
                  {getAttachmentIcon(att)}
                  <span className="truncate max-w-[120px]" title={att.title}>
                    {att.title}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* View mode toggle & external link */}
        <div className="flex items-center space-x-2">
          {showExtractedTextToggle && currentAttachment && resolvedTextContent && (
            <button
              data-testid="toggle-extracted-text-button"
              onClick={() => setViewMode((m) => (m === 'rendered' ? 'raw' : 'rendered'))}
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] bg-[#22262C] hover:bg-[#2D323A] text-gray-300 transition-colors"
              title="Toggle between rendered preview and LLM extracted text"
            >
              <Eye className="w-3 h-3 text-[#D4AF37]" />
              <span>{viewMode === 'rendered' ? 'Extracted Text' : 'Rendered'}</span>
            </button>
          )}

          {currentAttachment?.alternateLink && (
            <a
              href={currentAttachment.alternateLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] text-blue-400 hover:text-blue-300 hover:bg-[#22262C] transition-colors"
              title="Open in Drive / Google Classroom"
            >
              <span>Drive</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Preview Content Area */}
      <div className="flex-1 min-h-0 overflow-auto bg-[#121316] p-4">
        {/* Persistent Mounted PDF/Doc Iframe Cache Pool (prevents iframe reloads across attachment & student switches) */}
        {mountedPdfFramesList.length > 0 && (
          <div className={showActivePdfFrame ? 'h-full w-full flex flex-col' : 'hidden'}>
            {mountedPdfFramesList.map((frame) => {
              const isActiveFrame = showActivePdfFrame && currentFileId === frame.fileId;
              return (
                <iframe
                  key={frame.fileId}
                  data-testid={
                    isActiveFrame
                      ? 'preview-pdf-frame'
                      : `preview-pdf-frame-cached-${frame.fileId}`
                  }
                  src={frame.pdfSrc}
                  title={isActiveFrame ? currentAttachment?.title || frame.title : frame.title}
                  className={
                    isActiveFrame
                      ? 'w-full flex-1 rounded border border-[#333842] bg-white'
                      : 'hidden'
                  }
                />
              );
            })}
          </div>
        )}

        {attachments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <p className="text-sm">Student has turned in without file attachments.</p>
            <p className="text-xs text-gray-600 mt-1">Review student comments or short-answer responses in Zone C.</p>
          </div>
        ) : !currentAttachment ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            No attachment selected.
          </div>
        ) : isLoadingCurrentFile ? (
          <div className="h-full flex items-center justify-center space-x-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
            <span>Loading attachment from Google Drive...</span>
          </div>
        ) : viewMode === 'raw' && resolvedTextContent ? (
          /* Extracted text view (what the LLM reads) */
          <div className="h-full flex flex-col">
            <div className="text-[10px] text-[#D4AF37] uppercase tracking-wider font-semibold mb-2">
              Extracted Text Payload (Supplied to Gemini)
            </div>
            <pre
              data-testid="preview-text-content"
              className="flex-1 bg-[#1A1D21] border border-[#333842] rounded p-3 text-xs text-gray-200 font-mono whitespace-pre-wrap overflow-auto select-text"
            >
              {resolvedTextContent}
            </pre>
          </div>
        ) : showActivePdfFrame ? null : (
          /* Rendered format based on non-PDF attachment type or fallback */
          renderAttachmentContent(currentAttachment, resolvedTextContent, resolvedPreviewUrl)
        )}
      </div>

      {/* Rubric pane at the bottom */}
      {showRubricPane && children}
    </div>
  );
};

function renderAttachmentContent(
  att: SubmissionAttachment,
  resolvedTextContent?: string,
  resolvedPreviewUrl?: string
) {
  switch (att.type) {
    case 'PDF':
    case 'GOOGLE_DOC':
    case 'GOOGLE_SLIDES':
    case 'GOOGLE_SHEETS':
      if (resolvedPreviewUrl) {
        const pdfSrc = resolvedPreviewUrl.includes('#')
          ? resolvedPreviewUrl
          : `${resolvedPreviewUrl}#toolbar=0&navpanes=0`;
        return (
          <div className="h-full w-full flex flex-col">
            <iframe
              data-testid="preview-pdf-frame"
              src={pdfSrc}
              title={att.title}
              className="w-full flex-1 rounded border border-[#333842] bg-white"
            />
          </div>
        );
      }
      return (
        <div data-testid="preview-text-content" className="p-4 bg-[#1A1D21] rounded border border-[#333842] text-gray-300 font-mono select-text whitespace-pre-wrap">
          {resolvedTextContent || 'No preview available for this document.'}
        </div>
      );

    case 'CODE':
      return (
        <pre
          data-testid="preview-code-block"
          className="h-full bg-[#1A1D21] border border-[#333842] rounded p-4 text-xs font-mono text-emerald-300 overflow-auto select-text whitespace-pre"
        >
          <code>{resolvedTextContent || '// No code content available'}</code>
        </pre>
      );

    case 'IMAGE':
      return (
        <div className="h-full flex items-center justify-center p-4">
          <img
            data-testid="preview-image"
            src={att.thumbnailUrl || resolvedPreviewUrl || ''}
            alt={att.title}
            className="max-h-full max-w-full rounded border border-[#333842] object-contain shadow-lg"
          />
        </div>
      );

    case 'LINK':
      return (
        <div data-testid="preview-link-card" className="p-6 bg-[#1A1D21] rounded-lg border border-[#333842] space-y-3 max-w-xl mx-auto mt-8">
          <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-sm">
            <LinkIcon className="w-4 h-4" />
            <span>External Link Attachment</span>
          </div>
          <p className="text-gray-200 text-sm font-medium">{att.title}</p>
          <a
            href={att.alternateLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 text-blue-400 hover:underline break-all"
          >
            <span>{att.alternateLink}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          {resolvedTextContent && (
            <div className="mt-4 p-3 bg-[#121316] rounded border border-[#333842] text-gray-400 text-xs">
              <span className="font-semibold text-gray-300">Page Content Preview:</span>
              <p className="mt-1 whitespace-pre-wrap">{resolvedTextContent}</p>
            </div>
          )}
        </div>
      );

    case 'SHORT_ANSWER':
    case 'TEXT':
    default:
      return (
        <div
          data-testid="preview-text-content"
          className="h-full bg-[#1A1D21] border border-[#333842] rounded p-4 text-gray-200 select-text whitespace-pre-wrap font-sans text-sm leading-relaxed overflow-auto"
        >
          {att.shortAnswer || resolvedTextContent || 'No text content available.'}
        </div>
      );
  }
}
