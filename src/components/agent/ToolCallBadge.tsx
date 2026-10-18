import React, { useState } from 'react';
import { Wrench, CheckCircle2, XCircle, Loader2, ChevronDown } from 'lucide-react';
import { ToolCallItem } from '../../types/classroom';

interface ToolCallBadgeProps {
  tool: ToolCallItem;
  defaultExpanded?: boolean;
}

export const ToolCallBadge: React.FC<ToolCallBadgeProps> = ({ tool, defaultExpanded }) => {
  const isPending = tool.status === 'executing';
  const isSuccess = tool.status === 'success';
  const isError = tool.status === 'error';

  // Automatically expand if currently executing or failed, unless overridden
  const [isExpanded, setIsExpanded] = useState<boolean>(
    defaultExpanded !== undefined ? defaultExpanded : (isPending || isError)
  );

  return (
    <div
      data-testid="tool-call-badge"
      className="my-2 rounded-md border border-[#333842] bg-[#1A1D21] text-xs font-mono overflow-hidden shadow-sm"
    >
      {/* Header bar / Expander Trigger */}
      <div
        data-testid="tool-call-header"
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsExpanded((prev) => !prev)}
        className={`flex items-center justify-between px-3 py-1.5 bg-[#22262C] cursor-pointer select-none hover:bg-[#2D323A] transition-colors ${
          isExpanded ? 'border-b border-[#333842]' : ''
        }`}
      >
        <div className="flex items-center space-x-1.5 truncate mr-2">
          <Wrench className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
          <span className="font-semibold text-[#F3E5AB] truncate">Tool: {tool.name}</span>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {isPending && (
            <span className="inline-flex items-center space-x-1 text-[11px] text-blue-400 font-sans">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>executing</span>
            </span>
          )}
          {isSuccess && (
            <span className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 font-sans">
              <CheckCircle2 className="w-3 h-3" />
              <span>success</span>
            </span>
          )}
          {isError && (
            <span className="inline-flex items-center space-x-1 text-[11px] text-red-400 font-sans">
              <XCircle className="w-3 h-3" />
              <span>failed</span>
            </span>
          )}

          <button
            type="button"
            data-testid="tool-call-expander"
            aria-expanded={isExpanded}
            className="flex items-center space-x-1 text-[11px] font-sans text-gray-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-[#333842] transition-colors"
          >
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              {isExpanded ? 'Hide' : 'Details'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Collapsible Body */}
      {isExpanded && (
        <div data-testid="tool-call-details" className="p-2.5 space-y-2 bg-[#121316]">
          {tool.args && (
            <div>
              <div className="text-[10px] text-gray-400 font-sans uppercase tracking-wider mb-0.5">
                Parameters
              </div>
              <pre className="text-[11px] text-blue-300 bg-[#1A1D21] p-1.5 rounded border border-[#333842] overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}

          {tool.result !== undefined && (
            <div>
              <div className="text-[10px] text-gray-400 font-sans uppercase tracking-wider mb-0.5">
                Result
              </div>
              <pre className="text-[11px] text-emerald-300 bg-[#1A1D21] p-1.5 rounded border border-[#333842] overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}

          {tool.error && (
            <div>
              <div className="text-[10px] text-red-400 font-sans uppercase tracking-wider mb-0.5">
                Error
              </div>
              <pre className="text-[11px] text-red-300 bg-red-950/40 p-1.5 rounded border border-red-800/40 overflow-x-auto whitespace-pre-wrap">
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
