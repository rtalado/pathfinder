import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import type { Flashcard } from '@/types';
import { describeInterval, isDue, newCard, reviewCard, type Grade } from '@/lib/srs';
import { useAllRoadmaps } from '@/lib/hooks';
import { selectCard, useProgress } from '@/store/progressStore';
import { Markdown } from '@/components/Markdown';
import { Topbar } from '@/components/Topbar';

interface QueueItem {
  roadmapId: string;
  roadmapTitle: string;
  nodeId: string;
  nodeTitle: string;
  card: Flashcard;
}

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: 'Niet' },
  { grade: 'hard', label: 'Twijfel' },
  { grade: 'good', label: 'Wist ik' },
];

export function ReviewPage() {
  const { roadmaps } = useAllRoadmaps();
  const progress = useProgress((store) => store.state);
  const gradeCard = useProgress((store) => store.gradeCard);

  const [revealed, setRevealed] = useState(false);
  const [handled, setHandled] = useState<string[]>([]);

  const all = useMemo<QueueItem[]>(
    () =>
      roadmaps.flatMap((roadmap) =>
        roadmap.nodes.flatMap((node) =>
          (node.flashcards ?? []).map((card) => ({
            roadmapId: roadmap.id,
            roadmapTitle: roadmap.title,
            nodeId: node.id,
            nodeTitle: node.title,
            card,
          }))
        )
      ),
    [roadmaps]
  );

  const queue = useMemo(
    () =>
      all
        .filter((item) => !handled.includes(`${item.roadmapId}/${item.nodeId}/${item.card.id}`))
        .filter((item) => isDue(selectCard(progress, item.roadmapId, item.nodeId, item.card.id)))
        .sort((a, b) => {
          const left = selectCard(progress, a.roadmapId, a.nodeId, a.card.id)?.due ?? 0;
          const right = selectCard(progress, b.roadmapId, b.nodeId, b.card.id)?.due ?? 0;
          return left - right;
        }),
    [all, handled, progress]
  );

  const item = queue[0];

  if (!all.length) {
    return (
      <>
        <Topbar title="Overhoren" />
        <div className="content">
          <div className="page">
            <p className="empty">
              Nog geen kaarten. Ze horen bij de onderwerpen in een leerpad; zodra een onderwerp
              kaarten heeft, verschijnen ze hier.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!item) {
    const next = all
      .map((entry) => selectCard(progress, entry.roadmapId, entry.nodeId, entry.card.id))
      .filter(Boolean)
      .sort((a, b) => a!.due - b!.due)[0];

    return (
      <>
        <Topbar title="Overhoren" subtitle={`${all.length} kaarten in totaal`} />
        <div className="content">
          <div className="page stack">
            <div className="banner banner--ok">
              Klaar voor nu.
              {next ? ` De eerstvolgende kaart komt ${describeInterval(next)} terug.` : ''}
            </div>
            {handled.length > 0 && (
              <div>
                <button type="button" className="btn" onClick={() => setHandled([])}>
                  Nog een ronde
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  const key = `${item.roadmapId}/${item.nodeId}/${item.card.id}`;
  const existing = selectCard(progress, item.roadmapId, item.nodeId, item.card.id) ?? newCard();

  const handleGrade = (grade: Grade) => {
    gradeCard(item.roadmapId, item.nodeId, item.card.id, grade);
    if (grade !== 'again') setHandled((done) => [...done, key]);
    setRevealed(false);
  };

  return (
    <>
      <Topbar title="Overhoren" subtitle={`${queue.length} te gaan`} />
      <div className="content">
        <div className="page stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Link to={`/pad/${item.roadmapId}?node=${item.nodeId}`} className="tag">
              {item.roadmapTitle} · {item.nodeTitle}
            </Link>
            {existing.reps > 0 && <span className="dim" style={{ fontSize: 12 }}>{existing.reps}e herhaling</span>}
          </div>

          <div className="flashcard">
            <div className="flashcard__question">{item.card.question}</div>
            {revealed ? (
              <div className="flashcard__answer">
                <Markdown>{item.card.answer}</Markdown>
              </div>
            ) : (
              <>
                {item.card.hint && (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Hint: {item.card.hint}
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
              {GRADES.map(({ grade, label }) => (
                <button
                  key={grade}
                  type="button"
                  className={`btn${grade === 'good' ? ' btn--primary' : ''}`}
                  onClick={() => handleGrade(grade)}
                  style={{ flexDirection: 'column', gap: 1, padding: '9px 6px' }}
                >
                  <span>{label}</span>
                  <span style={{ fontSize: 10.5, opacity: 0.7 }}>
                    {grade === 'again' ? 'straks weer' : describeInterval(reviewCard(existing, grade))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
