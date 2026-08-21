import { useMemo, useState } from 'react';
import { Eye, RotateCcw } from 'lucide-react';
import type { Flashcard } from '@/types';
import { describeInterval, isDue, newCard, reviewCard, type Grade } from '@/lib/srs';
import { selectCard, useProgress } from '@/store/progressStore';
import { Markdown } from './Markdown';

const GRADES: { grade: Grade; label: string; hint: string }[] = [
  { grade: 'again', label: 'Niet', hint: 'straks weer' },
  { grade: 'hard', label: 'Twijfel', hint: 'korter interval' },
  { grade: 'good', label: 'Wist ik', hint: 'langer interval' },
];

export function FlashcardDeck({
  roadmapId,
  nodeId,
  cards,
}: {
  roadmapId: string;
  nodeId: string;
  cards: Flashcard[];
}) {
  const state = useProgress((store) => store.state);
  const gradeCard = useProgress((store) => store.gradeCard);

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewedNow, setReviewedNow] = useState<string[]>([]);

  // Kaarten die aan de beurt zijn eerst; wat je deze sessie al deed valt weg.
  const queue = useMemo(
    () =>
      cards.filter(
        (card) =>
          !reviewedNow.includes(card.id) &&
          isDue(selectCard(state, roadmapId, nodeId, card.id))
      ),
    [cards, reviewedNow, state, roadmapId, nodeId]
  );

  const card = queue[Math.min(index, queue.length - 1)];

  if (!card) {
    const next = cards
      .map((entry) => selectCard(state, roadmapId, nodeId, entry.id))
      .filter(Boolean)
      .sort((a, b) => a!.due - b!.due)[0];

    return (
      <div className="stack">
        <div className="banner banner--ok">
          Alles overhoord. {next ? `De eerstvolgende kaart komt ${describeInterval(next)} terug.` : ''}
        </div>
        {reviewedNow.length > 0 && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              setReviewedNow([]);
              setIndex(0);
              setRevealed(false);
            }}
          >
            <RotateCcw size={13} /> Deze ronde nog eens
          </button>
        )}
      </div>
    );
  }

  const handleGrade = (grade: Grade) => {
    gradeCard(roadmapId, nodeId, card.id, grade);
    // "Niet geweten" komt binnen deze sessie terug; de rest is klaar voor nu.
    if (grade !== 'again') setReviewedNow((done) => [...done, card.id]);
    setRevealed(false);
    setIndex((current) => (current + 1) % Math.max(1, queue.length));
  };

  const existing = selectCard(state, roadmapId, nodeId, card.id) ?? newCard();

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {queue.length} kaart{queue.length === 1 ? '' : 'en'} te gaan
        </span>
        {existing.reps > 0 && (
          <span className="tag">
            {existing.reps}e keer · {describeInterval(existing)}
          </span>
        )}
      </div>

      <div className="flashcard">
        <div className="flashcard__question">{card.question}</div>
        {revealed ? (
          <div className="flashcard__answer">
            <Markdown>{card.answer}</Markdown>
          </div>
        ) : (
          <>
            {card.hint && (
              <div className="muted" style={{ fontSize: 13 }}>
                Hint: {card.hint}
              </div>
            )}
            <div>
              <button type="button" className="btn" onClick={() => setRevealed(true)}>
                <Eye size={14} /> Toon antwoord
              </button>
            </div>
          </>
        )}
      </div>

      {revealed && (
        <div className="gradebar">
          {GRADES.map(({ grade, label, hint }) => (
            <button
              key={grade}
              type="button"
              className={`btn${grade === 'good' ? ' btn--primary' : ''}`}
              onClick={() => handleGrade(grade)}
              style={{ flexDirection: 'column', gap: 1, padding: '8px 6px' }}
            >
              <span>{label}</span>
              <span style={{ fontSize: 10.5, opacity: 0.7 }}>
                {grade === 'again' ? hint : describeInterval(reviewCard(existing, grade))}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
