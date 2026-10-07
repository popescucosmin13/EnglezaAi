// Renderer markdown minimal (headers, bold, italic, liste) — portat pe <Text>/<View> RN.
// Același parser regex ca pe web; elementele HTML devin stiluri de text imbricate.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, type Palette } from '../theme';

function inline(text: string, p: Palette): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/;
  while (rest.length > 0) {
    const m = rest.match(re);
    if (!m || m.index === undefined) {
      parts.push(rest);
      break;
    }
    if (m.index > 0) parts.push(rest.slice(0, m.index));
    if (m[1] !== undefined)
      parts.push(
        <Text key={key++} style={{ fontWeight: '700', color: p.primaryDeep }}>
          {m[1]}
        </Text>
      );
    else if (m[2] !== undefined)
      parts.push(
        <Text key={key++} style={{ fontStyle: 'italic' }}>
          {m[2]}
        </Text>
      );
    else if (m[3] !== undefined)
      parts.push(
        <Text key={key++} style={{ fontFamily: 'Courier', backgroundColor: p.bgSoft }}>
          {m[3]}
        </Text>
      );
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}

export default function Markdown({ text }: { text: string }) {
  const p = usePalette();
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      out.push(
        <View key={key++} style={st.list}>
          {listItems}
        </View>
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^#{1,3}\s/.test(t)) {
      flushList();
      const content = inline(t.replace(/^#+\s*/, ''), p);
      out.push(
        <Text key={key++} style={[st.heading, { color: p.ink }]}>
          {content}
        </Text>
      );
    } else if (/^(\d+\.|[-*])\s/.test(t)) {
      listItems.push(
        <View key={key++} style={st.li}>
          <Text style={[st.bullet, { color: p.ink2 }]}>•</Text>
          <Text style={[st.p, { color: p.ink, flex: 1 }]}>{inline(t.replace(/^(\d+\.|[-*])\s*/, ''), p)}</Text>
        </View>
      );
    } else if (t === '') {
      flushList();
    } else {
      flushList();
      out.push(
        <Text key={key++} style={[st.p, { color: p.ink }]}>
          {inline(t, p)}
        </Text>
      );
    }
  }
  flushList();
  return <View style={{ marginTop: 4 }}>{out}</View>;
}

const st = StyleSheet.create({
  heading: { fontSize: 16.5, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  p: { fontSize: 15, lineHeight: 22, marginVertical: 4 },
  list: { marginVertical: 6, gap: 3 },
  li: { flexDirection: 'row', gap: 8, paddingLeft: 6 },
  bullet: { fontSize: 15, lineHeight: 22 },
});
