import type { CardReview } from '@/types';

/**
 * Vereenvoudigde SM-2. Drie knoppen in plaats van zes cijfers, omdat je bij het
 * overhoren van normteksten toch alleen "wist ik", "twijfel" of "niet" denkt.
 */
export type Grade = 'again' | 'hard' | 'good';

const DAY = 86_400_000;
const MIN_EASE = 1.3;

export function newCard(now = Date.now()): CardReview {
  return { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, lastReviewedAt: 0 };
}

export function reviewCard(card: CardReview, grade: Grade, now = Date.now()): CardReview {
  if (grade === 'again') {
    return {
      ...card,
      // Binnen tien minuten terug, zodat je hem deze sessie nog een keer ziet.
      due: now + 10 * 60_000,
      interval: 0,
      ease: Math.max(MIN_EASE, card.ease - 0.2),
      reps: 0,
      lapses: card.lapses + 1,
      lastReviewedAt: now,
    };
  }

  const ease = grade === 'hard' ? Math.max(MIN_EASE, card.ease - 0.15) : card.ease + 0.05;
  let interval: number;
  if (card.reps === 0) interval = grade === 'hard' ? 1 : 2;
  else if (card.reps === 1) interval = grade === 'hard' ? 3 : 6;
  else interval = Math.round(card.interval * (grade === 'hard' ? 1.2 : ease));

  interval = Math.max(1, Math.min(interval, 365));

  return {
    due: now + interval * DAY,
    interval,
    ease,
    reps: card.reps + 1,
    lapses: card.lapses,
    lastReviewedAt: now,
  };
}

export function isDue(card: CardReview | undefined, now = Date.now()): boolean {
  return !card || card.due <= now;
}

/** Menselijke omschrijving van wanneer een kaart terugkomt. */
export function describeInterval(card: CardReview): string {
  if (card.interval === 0) return 'straks weer';
  if (card.interval === 1) return 'morgen';
  if (card.interval < 30) return `over ${card.interval} dagen`;
  const months = Math.round(card.interval / 30);
  return months === 1 ? 'over een maand' : `over ${months} maanden`;
}
