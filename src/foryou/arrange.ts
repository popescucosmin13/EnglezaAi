import type { ForYouCard } from './types';

export function arrangeForYouCards(cards: ForYouCard[], maxPassive = 2, maxInteractive = 2): ForYouCard[] {
  let passiveRun = 0;
  let interactiveRun = 0;
  const alreadyBalanced = cards.every((card) => {
    passiveRun = card.interactive ? 0 : passiveRun + 1;
    interactiveRun = card.interactive ? interactiveRun + 1 : 0;
    return passiveRun <= maxPassive && interactiveRun <= maxInteractive;
  });
  if (alreadyBalanced) return [...cards];

  const remaining = [...cards];
  const result: ForYouCard[] = [];
  let passive = 0;
  let interactive = 0;
  while (remaining.length) {
    let nextIndex = 0;
    if (passive >= maxPassive) {
      const activeIndex = remaining.findIndex((card) => card.interactive);
      if (activeIndex >= 0) nextIndex = activeIndex;
    } else if (interactive >= maxInteractive) {
      const passiveIndex = remaining.findIndex((card) => !card.interactive);
      if (passiveIndex >= 0) nextIndex = passiveIndex;
    }
    const [next] = remaining.splice(nextIndex, 1);
    result.push(next);
    if (next.interactive) {
      interactive += 1;
      passive = 0;
    } else {
      passive += 1;
      interactive = 0;
    }
  }
  return result;
}
