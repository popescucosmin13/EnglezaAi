import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../audio/recorder', () => ({ Recorder: class {} }));

import { ForYouSpeakPractice } from './ForYouSpeakPractice';

function render(completed = false) {
  return renderToStaticMarkup(
    <ForYouSpeakPractice
      target="Are you going to study tonight?"
      active
      isPlaying={false}
      completed={completed}
      onPlay={() => {}}
      onComplete={() => {}}
    />,
  );
}

describe('ForYouSpeakPractice', () => {
  it('oferă explicit ascultare, înregistrare locală și confirmare', () => {
    const html = render();
    expect(html).toContain('Ascultă modelul');
    expect(html).toContain('Înregistrează-te');
    expect(html).toContain('Am repetat și am comparat');
    expect(html).toContain('0 tokeni');
  });

  it('păstrează practica disponibilă după finalizare', () => {
    const html = render(true);
    expect(html).toContain('Practică terminată');
    expect(html).toContain('Ascultă modelul');
    expect(html).toContain('Înregistrează-te');
    expect(html).not.toContain('Am repetat și am comparat');
  });
});
