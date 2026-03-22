import type React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Render full markdown to sanitized HTML.
 * Uses marked for parsing + DOMPurify for safety.
 * Suitable for AI responses which contain headings, lists, code blocks, etc.
 */
export function renderMarkdown(text: string): React.ReactNode {
  const html = marked.parse(text, { async: false, breaks: true }) as string;
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'a', 'blockquote',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  });

  return (
    <div
      className="ai-markdown"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
