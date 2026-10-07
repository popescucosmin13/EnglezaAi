import type { ForYouInteraction } from './types';

export function eligibleAfterHours(hours: number, now = Date.now()): string {
  return new Date(now + hours * 3_600_000).toISOString();
}

export function eligibleAfterCorrect(correctAnswers: number, now = Date.now()): string {
  const days = [1, 3, 7, 14, 30, 60][Math.min(5, Math.max(0, correctAnswers - 1))];
  return eligibleAfterHours(days * 24, now);
}

export function interactionIsCoolingDown(interaction: ForYouInteraction | undefined, now = Date.now()): boolean {
  if (!interaction) return false;
  const explicitlyEligibleAt = Date.parse(interaction.nextEligibleAt);
  if (Number.isFinite(explicitlyEligibleAt)) return explicitlyEligibleAt > now;

  // Compatibilitate cu progresul salvat înainte de introducerea programării semantice.
  const lastSeenAt = Date.parse(interaction.lastSeenAt);
  if (!Number.isFinite(lastSeenAt)) return false;
  const ageHours = (now - lastSeenAt) / 3_600_000;
  if (interaction.known) return ageHours < 30 * 24;
  if (interaction.correctAnswers > 0) return ageHours < 24;
  return interaction.completions > 0 && ageHours < 12;
}
