import React, { useState, useEffect } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Link as LinkIcon, FileCode, Eye, Loader2, Video, Music, FileArchive, MessageSquare } from 'lucide-react';
import { StudentSubmissionDoc, SubmissionAttachment } from '../../types/classroom';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { env } from '../../config/env';

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
  children?: React.ReactNode;
}

export const SubmissionPreviewZone: React.FC<SubmissionPreviewZoneProps> = ({
  submission,
  children,
}) => {
  const { getAuthHeaders } = useAuth();
  const { showExtractedTextToggle, showRubricPane } = useSettings();
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');
  const [fetchedTextMap, setFetchedTextMap] = useState<Record<string, string>>({});
  const [fetchedPreviewUrlMap, setFetchedPreviewUrlMap] = useState<Record<string, string>>({});
  const [loadingFileIds, setLoadingFileIds] = useState<Record<string, boolean>>({});

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

  // Fetch live text and/or preview blob from Google Drive with authenticated headers
  useEffect(() => {
    const fileId = currentAttachment?.driveFileId;
    if (!currentAttachment || !fileId) return;

    const needsText =
      (currentAttachment.type === 'CODE' ||
        currentAttachment.type === 'TEXT' ||
        currentAttachment.type === 'GOOGLE_DOC' ||
        currentAttachment.type === 'GOOGLE_SHEETS') &&
      !currentAttachment.contentPreview &&
      fetchedTextMap[fileId] === undefined;

    const needsPreviewBlob =
      (currentAttachment.type === 'PDF' ||
        currentAttachment.type === 'GOOGLE_DOC' ||
        currentAttachment.type === 'GOOGLE_SLIDES' ||
        currentAttachment.type === 'GOOGLE_SHEETS' ||
        (currentAttachment.type === 'IMAGE' && !currentAttachment.thumbnailUrl)) &&
      fetchedPreviewUrlMap[fileId] === undefined;

    if (!needsText && !needsPreviewBlob) return;

    let cancelled = false;
    const loadDriveAsset = async () => {
      setLoadingFileIds((prev) => ({ ...prev, [fileId]: true }));
      try {
        const headers = await getAuthHeaders();

        const [fetchedText, fetchedBlobUrl] = await Promise.all([
          needsText
            ? (async () => {
                const res = await fetch(
                  `${env.API_BASE_URL}/classroom/drive-file/${encodeURIComponent(fileId)}?exportType=text`,
                  { headers }
                );
                return res.ok ? await res.text() : '';
              })()
            : Promise.resolve(undefined),
          needsPreviewBlob
            ? (async () => {
                const res = await fetch(
                  `${env.API_BASE_URL}/classroom/drive-file/${encodeURIComponent(fileId)}?exportType=preview`,
                  { headers }
                );
                if (!res.ok) return '';
                const blob = await res.blob();
                return URL.createObjectURL(blob);
              })()
            : Promise.resolve(undefined),
        ]);

        if (!cancelled) {
          if (fetchedText !== undefined) {
            setFetchedTextMap((prev) => ({ ...prev, [fileId]: fetchedText }));
          }
          if (fetchedBlobUrl !== undefined) {
            setFetchedPreviewUrlMap((prev) => ({ ...prev, [fileId]: fetchedBlobUrl }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch Drive preview:', err);
        if (!cancelled) {
          if (needsText) setFetchedTextMap((prev) => ({ ...prev, [fileId]: '' }));
          if (needsPreviewBlob) setFetchedPreviewUrlMap((prev) => ({ ...prev, [fileId]: '' }));
        }
      } finally {
        setLoadingFileIds((prev) => ({ ...prev, [fileId]: false }));
      }
    };

    loadDriveAsset();
    return () => {
      cancelled = true;
    };
  }, [currentAttachment, fetchedTextMap, fetchedPreviewUrlMap, getAuthHeaders]);

  if (!submission) {
    return (
      <div
        data-testid="submission-preview-container"
        className="flex-1 h-full flex flex-col border-r border-[#30363d] bg-[#0d1117] text-gray-500 text-sm select-none overflow-hidden"
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

  const resolvedTextContent =
    currentAttachment?.contentPreview ||
    (currentAttachment?.driveFileId ? fetchedTextMap[currentAttachment.driveFileId] : undefined);

  const resolvedPreviewUrl = currentAttachment?.driveFileId
    ? fetchedPreviewUrlMap[currentAttachment.driveFileId]
    : undefined;

  const isLoadingCurrentFile = Boolean(
    currentAttachment?.driveFileId && loadingFileIds[currentAttachment.driveFileId]
  );

  return (
    <div
      data-testid="submission-preview-container"
      className="flex-1 h-full flex flex-col border-r border-[#30363d] bg-[#0d1117] select-none text-xs overflow-hidden"
    >
      {/* Top Attachment Switcher Header */}
      <div className="h-10 border-b border-[#30363d] bg-[#161b22] px-3 flex items-center justify-between shrink-0">
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
                  onClick={() => {
                    setActiveAttachmentIndex(idx);
                    setViewMode('rendered');
                  }}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs transition-colors shrink-0 ${
                    isActive
                      ? 'bg-[#21262d] text-white font-medium border border-gray-600/50'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#1f242c]'
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
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] bg-[#21262d] hover:bg-[#30363d] text-gray-300 transition-colors"
              title="Toggle between rendered preview and LLM extracted text"
            >
              <Eye className="w-3 h-3 text-purple-400" />
              <span>{viewMode === 'rendered' ? 'Extracted Text' : 'Rendered'}</span>
            </button>
          )}

          {currentAttachment?.alternateLink && (
            <a
              href={currentAttachment.alternateLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] text-blue-400 hover:text-blue-300 hover:bg-[#21262d] transition-colors"
              title="Open in Drive / Google Classroom"
            >
              <span>Drive</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Preview Content Area */}
      <div className="flex-1 min-h-0 overflow-auto bg-[#090d13] p-4">
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
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            <span>Loading attachment from Google Drive...</span>
          </div>
        ) : viewMode === 'raw' && resolvedTextContent ? (
          /* Extracted text view (what the LLM reads) */
          <div className="h-full flex flex-col">
            <div className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold mb-2">
              Extracted Text Payload (Supplied to Gemini)
            </div>
            <pre
              data-testid="preview-text-content"
              className="flex-1 bg-[#161b22] border border-[#30363d] rounded p-3 text-xs text-gray-200 font-mono whitespace-pre-wrap overflow-auto select-text"
            >
              {resolvedTextContent}
            </pre>
          </div>
        ) : (
          /* Rendered format based on attachment type */
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
        return (
          <div className="h-full w-full flex flex-col">
            <iframe
              data-testid="preview-pdf-frame"
              src={resolvedPreviewUrl}
              title={att.title}
              className="w-full flex-1 rounded border border-[#30363d] bg-white"
            />
          </div>
        );
      }
      return (
        <div data-testid="preview-text-content" className="p-4 bg-[#161b22] rounded border border-[#30363d] text-gray-300 font-mono select-text whitespace-pre-wrap">
          {resolvedTextContent || 'No preview available for this document.'}
        </div>
      );

    case 'CODE':
      return (
        <pre
          data-testid="preview-code-block"
          className="h-full bg-[#161b22] border border-[#30363d] rounded p-4 text-xs font-mono text-emerald-300 overflow-auto select-text whitespace-pre"
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
            className="max-h-full max-w-full rounded border border-[#30363d] object-contain shadow-lg"
          />
        </div>
      );

    case 'LINK':
      return (
        <div data-testid="preview-link-card" className="p-6 bg-[#161b22] rounded-lg border border-[#30363d] space-y-3 max-w-xl mx-auto mt-8">
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
            <div className="mt-4 p-3 bg-[#0d1117] rounded border border-gray-800 text-gray-400 text-xs">
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
          className="h-full bg-[#161b22] border border-[#30363d] rounded p-4 text-gray-200 select-text whitespace-pre-wrap font-sans text-sm leading-relaxed overflow-auto"
        >
          {att.shortAnswer || resolvedTextContent || 'No text content available.'}
        </div>
      );
  }
}
