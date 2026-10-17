import React, { useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Link as LinkIcon, FileCode, Eye } from 'lucide-react';
import { StudentSubmissionDoc, SubmissionAttachment } from '../../types/classroom';
import { env } from '../../config/env';

interface SubmissionPreviewZoneProps {
  submission: StudentSubmissionDoc | null;
}

export const SubmissionPreviewZone: React.FC<SubmissionPreviewZoneProps> = ({ submission }) => {
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');

  if (!submission) {
    return (
      <div
        data-testid="submission-preview-container"
        className="w-[48%] h-full flex flex-col items-center justify-center border-r border-[#30363d] bg-[#0d1117] text-gray-500 text-sm select-none"
      >
        <FileText className="w-10 h-10 mb-2 text-gray-600" />
        <p>Select a student from the roster to inspect their submission</p>
      </div>
    );
  }

  const attachments = submission.attachments || [];
  const currentAttachment: SubmissionAttachment | undefined = attachments[activeAttachmentIndex] || attachments[0];

  const getAttachmentIcon = (type: string) => {
    switch (type) {
      case 'GOOGLE_DOC':
      case 'PDF':
      case 'TEXT':
        return <FileText className="w-3.5 h-3.5 text-blue-400" />;
      case 'GOOGLE_SLIDES':
        return <FileText className="w-3.5 h-3.5 text-amber-400" />;
      case 'GOOGLE_SHEETS':
        return <FileText className="w-3.5 h-3.5 text-emerald-400" />;
      case 'CODE':
        return <FileCode className="w-3.5 h-3.5 text-purple-400" />;
      case 'IMAGE':
        return <ImageIcon className="w-3.5 h-3.5 text-pink-400" />;
      case 'LINK':
        return <LinkIcon className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  return (
    <div
      data-testid="submission-preview-container"
      className="w-[48%] h-full flex flex-col border-r border-[#30363d] bg-[#0d1117] select-none text-xs"
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
                  {getAttachmentIcon(att.type)}
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
          {currentAttachment && currentAttachment.contentPreview && (
            <button
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
      <div className="flex-1 overflow-auto bg-[#090d13] p-4">
        {attachments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <p className="text-sm">Student has turned in without file attachments.</p>
            <p className="text-xs text-gray-600 mt-1">Review student comments or short-answer responses in Zone C.</p>
          </div>
        ) : !currentAttachment ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            No attachment selected.
          </div>
        ) : viewMode === 'raw' && currentAttachment.contentPreview ? (
          /* Extracted text view (what the LLM reads) */
          <div className="h-full flex flex-col">
            <div className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold mb-2">
              Extracted Text Payload (Supplied to Gemini)
            </div>
            <pre
              data-testid="preview-text-content"
              className="flex-1 bg-[#161b22] border border-[#30363d] rounded p-3 text-xs text-gray-200 font-mono whitespace-pre-wrap overflow-auto select-text"
            >
              {currentAttachment.contentPreview}
            </pre>
          </div>
        ) : (
          /* Rendered format based on attachment type */
          renderAttachmentContent(currentAttachment)
        )}
      </div>
    </div>
  );
};

function renderAttachmentContent(att: SubmissionAttachment) {
  switch (att.type) {
    case 'PDF':
    case 'GOOGLE_DOC':
    case 'GOOGLE_SLIDES':
    case 'GOOGLE_SHEETS':
      if (att.driveFileId) {
        const previewUrl = `${env.API_BASE_URL}/classroom/drive-file/${att.driveFileId}?exportType=preview`;
        return (
          <div className="h-full w-full flex flex-col">
            <iframe
              data-testid="preview-pdf-frame"
              src={previewUrl}
              title={att.title}
              className="w-full flex-1 rounded border border-[#30363d] bg-white"
            />
          </div>
        );
      }
      return (
        <div data-testid="preview-text-content" className="p-4 bg-[#161b22] rounded border border-[#30363d] text-gray-300 font-mono select-text whitespace-pre-wrap">
          {att.contentPreview || 'No preview available for this document.'}
        </div>
      );

    case 'CODE':
      return (
        <pre
          data-testid="preview-code-block"
          className="h-full bg-[#161b22] border border-[#30363d] rounded p-4 text-xs font-mono text-emerald-300 overflow-auto select-text whitespace-pre"
        >
          <code>{att.contentPreview || '// No code content available'}</code>
        </pre>
      );

    case 'IMAGE':
      return (
        <div className="h-full flex items-center justify-center p-4">
          <img
            data-testid="preview-image"
            src={att.thumbnailUrl || (att.driveFileId ? `${env.API_BASE_URL}/classroom/drive-file/${att.driveFileId}` : '')}
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
          {att.contentPreview && (
            <div className="mt-4 p-3 bg-[#0d1117] rounded border border-gray-800 text-gray-400 text-xs">
              <span className="font-semibold text-gray-300">Page Content Preview:</span>
              <p className="mt-1 whitespace-pre-wrap">{att.contentPreview}</p>
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
          {att.shortAnswer || att.contentPreview || 'No text content available.'}
        </div>
      );
  }
}
