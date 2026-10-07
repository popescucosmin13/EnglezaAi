// Renderer markdown minimal (headers, bold, italic, liste) — suficient pentru rapoarte/debrief.

import React from 'react';

function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  const re = /~~(.+?)~~|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/;
  while (rest.length > 0) {
    const m = rest.match(re);
    if (!m || m.index === undefined) {
      parts.push(rest);
      break;
    }
    if (m.index > 0) parts.push(rest.slice(0, m.index));
    // ~~text~~ = varianta greșită (lecțiile de gramatică o arată tăiată, cu roșu)
    if (m[1] !== undefined) parts.push(<del key={key++}>{m[1]}</del>);
    else if (m[2] !== undefined) parts.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] !== undefined) parts.push(<code key={key++}>{m[4]}</code>);
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      out.push(<ul key={key++}>{listItems}</ul>);
      listItems = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^#{1,3}\s/.test(t)) {
      flushList();
      const level = t.match(/^#+/)![0].length;
      const content = inline(t.replace(/^#+\s*/, ''));
      if (level === 1) out.push(<h2 key={key++}>{content}</h2>);
      else if (level === 2) out.push(<h3 key={key++}>{content}</h3>);
      else out.push(<h3 key={key++}>{content}</h3>);
    } else if (/^(\d+\.|[-*])\s/.test(t)) {
      listItems.push(<li key={key++}>{inline(t.replace(/^(\d+\.|[-*])\s*/, ''))}</li>);
    } else if (t === '') {
      flushList();
    } else {
      flushList();
      out.push(<p key={key++}>{inline(t)}</p>);
    }
  }
  flushList();
  return <div className="md">{out}</div>;
}
