import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import {
  educationContent,
  emptyLessonProgress,
  getLesson,
  localize,
  uiText,
  useEducationStore,
  type CompletionRule,
  type Locale,
} from '../../stores/useEducationStore';
import { RichText } from './GlossaryTerm';

// Re-exported for backwards compatibility; the implementation lives in ./GlossaryTerm.
export { GlossaryTerm, RichText } from './GlossaryTerm';

function waitingHint(rule: CompletionRule, locale: Locale): string {
  switch (rule.event) {
    case 'selection':
      return uiText('waitSelection', locale);
    case 'animation':
      return uiText('waitAnimation', locale);
    case 'explode':
      return uiText(rule.exploded ? 'waitExplodeOn' : 'waitExplodeOff', locale);
    default:
      return '';
  }
}

export interface GuidedLessonProps {
  lessonId?: string;
  locale: Locale;
  /** Called with the component to highlight in the 3D scene (null clears it). */
  onHighlight?: (componentId: string | null) => void;
  onClose?: () => void;
}

/**
 * Step-by-step lesson panel. Steps complete through viewer events forwarded via
 * `useEducationStore.getState().reportEvent(...)` (selection / animation / explode)
 * or the Next button for manual steps. The lesson is active only while this panel
 * is mounted: unmounting (closing the panel) stops it so viewer events no longer
 * advance it in the background.
 */
export function GuidedLesson({
  lessonId = educationContent.lessons[0]?.id,
  locale,
  onHighlight,
  onClose,
}: GuidedLessonProps) {
  const lesson = lessonId ? getLesson(lessonId) : undefined;
  const storedProgress = useEducationStore((s) => (lessonId ? s.lessons[lessonId] : undefined));
  const progress = storedProgress ?? emptyLessonProgress();
  const { startLesson, stopLesson, nextLessonStep, prevLessonStep, resetLesson } =
    useEducationStore.getState();

  // Latest-ref: parents may pass inline callbacks without re-triggering effects.
  const onHighlightRef = useRef(onHighlight);
  useLayoutEffect(() => {
    onHighlightRef.current = onHighlight;
  });

  useEffect(() => {
    if (!lessonId) return;
    startLesson(lessonId);
    return () => stopLesson(lessonId);
  }, [lessonId, startLesson, stopLesson]);

  const stepIndex = lesson
    ? Math.min(Math.max(progress.currentStep, 0), lesson.steps.length - 1)
    : 0;
  const step = lesson?.steps[stepIndex];
  const highlightTarget = progress.completed ? null : (step?.target ?? null);

  useEffect(() => {
    onHighlightRef.current?.(highlightTarget);
  }, [highlightTarget]);

  useEffect(() => () => onHighlightRef.current?.(null), []);

  if (!lesson || !step) return null;

  const total = lesson.steps.length;
  const doneCount = progress.completedStepIds.filter((id) => lesson.steps.some((s) => s.id === id)).length;
  const stepDone = progress.completedStepIds.includes(step.id);
  const canAdvance = stepDone || step.completion.event === 'manual';
  const isLast = stepIndex === total - 1;

  return (
    <section style={styles.panel} aria-labelledby="guided-lesson-title" data-testid="guided-lesson">
      <header style={styles.header}>
        <h2 id="guided-lesson-title" style={styles.title}>
          {localize(lesson.title, locale)}
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={uiText('close', locale)}>
            ×
          </button>
        )}
      </header>

      <div
        role="progressbar"
        aria-label={uiText('progressLabel', locale)}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={doneCount}
        style={styles.progressTrack}
      >
        <div style={{ ...styles.progressFill, width: `${(doneCount / total) * 100}%` }} />
      </div>

      {progress.completed ? (
        <div data-testid="lesson-complete">
          <h3>{uiText('lessonComplete', locale)}</h3>
          <p>{uiText('lessonCompleteBody', locale)}</p>
          <button type="button" onClick={() => resetLesson(lesson.id)}>
            {uiText('restartLesson', locale)}
          </button>
        </div>
      ) : (
        <>
          <p style={styles.muted}>{uiText('stepOf', locale, { current: stepIndex + 1, total })}</p>
          <h3>{localize(step.title, locale)}</h3>
          <p>
            <RichText text={localize(step.content, locale)} locale={locale} />
          </p>
          <p style={styles.muted} aria-live="polite">
            {stepDone ? `✓ ${uiText('stepDone', locale)}` : waitingHint(step.completion, locale)}
          </p>
          <footer style={styles.footer}>
            <button type="button" onClick={prevLessonStep} disabled={stepIndex === 0}>
              {uiText('back', locale)}
            </button>
            <button type="button" onClick={nextLessonStep} disabled={!canAdvance}>
              {uiText(isLast ? 'finish' : 'next', locale)}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}

export default GuidedLesson;

const styles: Record<string, CSSProperties> = {
  panel: {
    maxWidth: 360,
    padding: 16,
    borderRadius: 8,
    background: 'rgba(20, 24, 28, 0.92)',
    color: '#f2f2f2',
    fontFamily: 'inherit',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { margin: 0, fontSize: 18 },
  progressTrack: { height: 6, margin: '12px 0', background: '#3a3f45', borderRadius: 3 },
  progressFill: { height: '100%', background: '#7cc36e', borderRadius: 3, transition: 'width .3s' },
  muted: { opacity: 0.75, fontSize: 13 },
  footer: { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 },
};
