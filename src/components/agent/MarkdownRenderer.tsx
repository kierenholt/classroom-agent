import React, { useState, useMemo } from 'react';
import { marked, Token, Tokens } from 'marked';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Decodes common HTML entity escapes such as &amp;, &quot;, &lt;, &gt;, &#39;
 */
function decodeEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Preprocesses markdown text to normalize pre-escaped entities for blockquotes.
 */
function preprocessMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/^(\s*)&gt;\s?/gm, '$1> ');
}

/**
 * Clean code block with copy to clipboard functionality.
 */
const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded bg-[#0d1117] border border-[#30363d] overflow-hidden text-xs">
      <div className="px-3 py-1 bg-[#161b22] border-b border-[#30363d] text-[10px] text-gray-400 font-mono flex justify-between items-center select-none">
        <span>{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center space-x-1 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-2.5 overflow-x-auto text-[11px] font-mono text-purple-200 leading-snug">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const tokens = useMemo(() => {
    if (!content) return [];
    try {
      return marked.lexer(preprocessMarkdown(content), { gfm: true, breaks: true });
    } catch (err) {
      console.error('Error parsing markdown tokens:', err);
      return [];
    }
  }, [content]);

  if (!content) return null;

  const renderInlineTokens = (inlineTokens: Token[]): React.ReactNode => {
    return inlineTokens.map((token, index) => {
      const key = `inline-${token.type}-${index}`;
      switch (token.type) {
        case 'strong': {
          const strong = token as Tokens.Strong;
          return (
            <strong key={key} className="font-semibold text-white">
              {strong.tokens ? renderInlineTokens(strong.tokens) : decodeEntities(strong.text)}
            </strong>
          );
        }
        case 'em': {
          const em = token as Tokens.Em;
          return (
            <em key={key} className="italic text-gray-200">
              {em.tokens ? renderInlineTokens(em.tokens) : decodeEntities(em.text)}
            </em>
          );
        }
        case 'codespan': {
          const cs = token as Tokens.Codespan;
          return (
            <code
              key={key}
              className="bg-[#0d1117] text-purple-300 px-1 py-0.5 rounded text-[11px] font-mono border border-purple-500/20"
            >
              {decodeEntities(cs.text)}
            </code>
          );
        }
        case 'link': {
          const link = token as Tokens.Link;
          return (
            <a
              key={key}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              title={link.title || undefined}
            >
              {link.tokens ? renderInlineTokens(link.tokens) : decodeEntities(link.text)}
            </a>
          );
        }
        case 'del': {
          const del = token as Tokens.Del;
          return (
            <del key={key} className="line-through text-gray-400">
              {del.tokens ? renderInlineTokens(del.tokens) : decodeEntities(del.text)}
            </del>
          );
        }
        case 'br':
          return <br key={key} />;
        case 'escape': {
          const esc = token as Tokens.Escape;
          return <span key={key}>{esc.text}</span>;
        }
        case 'text': {
          const txt = token as Tokens.Text;
          return (
            <span key={key}>
              {txt.tokens && txt.tokens.length > 0
                ? renderInlineTokens(txt.tokens)
                : decodeEntities(txt.text)}
            </span>
          );
        }
        default:
          return 'text' in token ? decodeEntities((token as any).text) : null;
      }
    });
  };

  const renderListItem = (item: Tokens.ListItem, index: number): React.ReactNode => {
    const key = `li-${index}`;
    if (item.task) {
      return (
        <li key={key} className="leading-relaxed list-none -ml-4 flex items-start space-x-1.5 my-0.5">
          <input
            type="checkbox"
            checked={item.checked}
            readOnly
            className="mt-0.5 rounded bg-black/40 border-gray-600 accent-purple-500"
          />
          <div className="flex-1">
            {item.tokens.map((t, i) => renderBlockToken(t, i))}
          </div>
        </li>
      );
    }

    return (
      <li key={key} className="leading-relaxed my-0.5">
        {item.tokens.map((t, i) => renderBlockToken(t, i))}
      </li>
    );
  };

  const renderBlockToken = (token: Token, index: number): React.ReactNode => {
    const key = `${token.type}-${index}`;
    switch (token.type) {
      case 'heading': {
        const heading = token as Tokens.Heading;
        const headingContent = heading.tokens
          ? renderInlineTokens(heading.tokens)
          : decodeEntities(heading.text);
        switch (heading.depth) {
          case 1:
            return (
              <h1 key={key} className="text-sm font-bold text-purple-200 mt-3 mb-1.5 pb-1 border-b border-purple-500/20">
                {headingContent}
              </h1>
            );
          case 2:
            return (
              <h2 key={key} className="text-xs font-bold text-purple-200 mt-2.5 mb-1 pb-0.5 border-b border-purple-500/10">
                {headingContent}
              </h2>
            );
          case 3:
            return (
              <h3 key={key} className="text-xs font-semibold text-purple-300 uppercase tracking-wide mt-2 mb-1">
                {headingContent}
              </h3>
            );
          default:
            return (
              <h4 key={key} className="text-xs font-semibold text-gray-200 mt-1.5 mb-0.5">
                {headingContent}
              </h4>
            );
        }
      }
      case 'paragraph': {
        const p = token as Tokens.Paragraph;
        return (
          <p key={key} className="my-1.5 leading-relaxed text-gray-100">
            {p.tokens ? renderInlineTokens(p.tokens) : decodeEntities(p.text)}
          </p>
        );
      }
      case 'hr':
        return <hr key={key} className="border-t border-[#3b3260] my-2.5" />;
      case 'list': {
        const list = token as Tokens.List;
        const ListTag = list.ordered ? 'ol' : 'ul';
        const listClass = list.ordered
          ? 'list-decimal list-outside pl-4 space-y-1 my-1.5'
          : 'list-disc list-outside pl-4 space-y-1 my-1.5';
        return (
          <ListTag
            key={key}
            start={list.start ? Number(list.start) : undefined}
            className={listClass}
          >
            {list.items.map((item, i) => renderListItem(item, i))}
          </ListTag>
        );
      }
      case 'blockquote': {
        const bq = token as Tokens.Blockquote;
        return (
          <blockquote
            key={key}
            className="border-l-2 border-purple-400/60 pl-3 my-2 text-gray-300 italic bg-purple-950/20 py-1 rounded-r"
          >
            {bq.tokens ? bq.tokens.map((t, i) => renderBlockToken(t, i)) : decodeEntities(bq.text)}
          </blockquote>
        );
      }
      case 'code': {
        const code = token as Tokens.Code;
        return <CodeBlock key={key} code={code.text} lang={code.lang} />;
      }
      case 'table': {
        const tbl = token as Tokens.Table;
        return (
          <div key={key} className="overflow-x-auto my-2 rounded border border-[#30363d]">
            <table className="min-w-full text-left border-collapse text-xs">
              <thead className="bg-[#0d1117] border-b border-[#30363d] text-gray-200">
                <tr>
                  {tbl.header.map((cell, ci) => (
                    <th
                      key={ci}
                      style={{ textAlign: tbl.align[ci] || 'left' }}
                      className="p-1.5 font-semibold border-r border-[#30363d] last:border-r-0"
                    >
                      {cell.tokens ? renderInlineTokens(cell.tokens) : decodeEntities(cell.text)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {tbl.rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-white/5 transition-colors">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{ textAlign: tbl.align[ci] || 'left' }}
                        className="p-1.5 text-gray-300 border-r border-[#30363d] last:border-r-0"
                      >
                        {cell.tokens ? renderInlineTokens(cell.tokens) : decodeEntities(cell.text)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'space':
        return null;
      case 'text': {
        const txt = token as Tokens.Text;
        return (
          <span key={key}>
            {txt.tokens && txt.tokens.length > 0
              ? renderInlineTokens(txt.tokens)
              : decodeEntities(txt.text)}
          </span>
        );
      }
      case 'html': {
        const htmlToken = token as Tokens.HTML;
        return (
          <span key={key} className="text-gray-300">
            {decodeEntities(htmlToken.text)}
          </span>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div
      data-testid="markdown-content"
      className={`markdown-content text-xs leading-relaxed text-gray-100 select-text break-words ${className}`}
    >
      {tokens.map((token, i) => renderBlockToken(token, i))}
    </div>
  );
};
