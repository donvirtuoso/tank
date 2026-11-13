import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { RichText } from '../education/GlossaryTerm';
import {
  educationContent,
  localize,
  uiText,
  useEducationStore,
  type CameraFocus,
  type Locale,
  type TutorialAnimation,
} from '../../stores/useEducationStore';

export type TutorialDirection = 'initial' | 'forward' | 'backward' | 'reset';

export interface TutorialStepChange {
  /** Index of the active step, or `steps.length` when the summary is shown. */
  position: number;
  /** Previous position, null on first mount. */
  previousPosition: number | null;
  direction: TutorialDirection;
  /**
   * Parts that must already be assembled *before* the current step's demo
   * (all parts on the summary). Parts not listed must be shown disassembled —
   * this lets the scene undo later steps on Back / Reset.
   */
  assembledParts: string[];
  summary: boolean;
}

export interface AssemblyTutorialProps {
  locale: Locale;
  /** Highlight a component in the 3D scene (null clears it). */
  onHighlight?: (componentId: string | null) => void;
  /** Move the camera to focus on the current step. */
  onFocusCamera?: (camera: CameraFocus) => void;
  /** Play the demo animation of the current step. */
  onPlayAnimation?: (animation: TutorialAnimation) => void;
  /**
   * Called before the demo whenever the step changes (incl. Back / Reset / summary),
   * so the scene can sync which parts are assembled.
   */
  onStepChange?: (change: TutorialStepChange) => void;
  onClose?: () => void;
}

/**
 * Assembly tutorial: each step highlights a part, focuses the camera and plays a
 * demo animation. Supports Back / Next / Reset and shows a summary when finished.
 * Progress is persisted by useEducationStore. Callback props may change identity
 * on every render (inline arrows are fine): they're read through a ref, so only a
 * real step change re-runs the highlight / camera / animation.
 */
export function AssemblyTutorial({
  locale,
  onHighlight,
  onFocusCamera,
  onPlayAnimation,
  onStepChange,
  onClose,
}: AssemblyTutorialProps) {
  const tutorial = educationContent.assemblyTutorial;
  const progress = useEducationStore((s) => s.tutorial);
  const { tutorialNext, tutorialPrev, tutorialReset } = useEducationStore.getState();

  const total = tutorial.steps.length;
  const index = Math.min(Math.max(progress.currentStep, 0), total - 1);
  const step = tutorial.steps[index];
  const showSummary = progress.completed;
  const position = showSummary ? total : index;

  // Latest-ref pattern for parent callbacks.
  const callbacks = useRef({ onHighlight, onFocusCamera, onPlayAnimation, onStepChange });
  useLayoutEffect(() => {
    callbacks.current = { onHighlight, onFocusCamera, onPlayAnimation, onStepChange };
  });

  const previousPosition = useRef<number | null>(null);
  const pendingReset = useRef(false);

  // Each time the active step changes: sync assembly state, highlight, focus camera, play the demo.
  useEffect(() => {
    const { steps } = educationContent.assemblyTutorial;
    const cb = callbacks.current;
    const prev = previousPosition.current;
    let direction: TutorialDirection =
      prev === null ? 'initial' : position > prev ? 'forward' : position < prev ? 'backward' : 'initial';
    if (pendingReset.current) direction = 'reset';
    pendingReset.current = false;
    previousPosition.current = position;

    const summary = position >= steps.length;
    cb.onStepChange?.({
      position,
      previousPosition: prev,
      direction,
      assembledParts: steps.slice(0, position).map((s) => s.target),
      summary,
    });
    const current = steps[position];
    if (summary || !current) {
      cb.onHighlight?.(null);
      return;
    }
    cb.onHighlight?.(current.target);
    cb.onFocusCamera?.(current.camera);
    cb.onPlayAnimation?.(current.animation);
  }, [position]);

  // Clear the highlight only on unmount.
  useEffect(() => () => callbacks.current.onHighlight?.(null), []);

  const playDemo = () => {
    if (step) callbacks.current.onPlayAnimation?.(step.animation);
  };

  const reset = () => {
    if (position === 0) return;
    pendingReset.current = true;
    tutorialReset();
  };

  if (!step) return null;

  return (
    <section style={styles.panel} aria-labelledby="assembly-tutorial-title" data-testid="assembly-tutorial">
      <header style={styles.header}>
        <h2 id="assembly-tutorial-title" style={styles.title}>
          {localize(tutorial.title, locale)}
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={uiText('close', locale)}>
            ×
          </button>
        )}
      </header>

      {showSummary ? (
        <div data-testid="assembly-summary">
          <h3>{localize(tutorial.summary.title, locale)}</h3>
          <p>{localize(tutorial.summary.content, locale)}</p>
          <ul>
            {tutorial.summary.points.map((point, i) => (
              <li key={i}>{localize(point, locale)}</li>
            ))}
          </ul>
          <ol style={styles.recap} aria-label={uiText('summaryTitle', locale)}>
            {tutorial.steps.map((s) => (
              <li key={s.id}>{localize(s.title, locale)}</li>
            ))}
          </ol>
          <footer style={styles.footer}>
            <button type="button" onClick={tutorialPrev}>
              {uiText('back', locale)}
            </button>
            <button type="button" onClick={reset}>
              {uiText('restartTutorial', locale)}
            </button>
          </footer>
        </div>
      ) : (
        <>
          <p style={styles.muted}>{uiText('stepOf', locale, { current: index + 1, total })}</p>
          <ol style={styles.dots} aria-hidden="true">
            {tutorial.steps.map((s, i) => (
              <li
                key={s.id}
                style={{ ...styles.dot, background: i <= index ? '#7cc36e' : '#3a3f45' }}
              />
            ))}
          </ol>
          <h3>{localize(step.title, locale)}</h3>
          <p>
            <RichText text={localize(step.content, locale)} locale={locale} />
          </p>
          <button type="button" onClick={playDemo}>
            ▶ {uiText('replayDemo', locale)}
          </button>
          <footer style={styles.footer}>
            <button type="button" onClick={tutorialPrev} disabled={index === 0}>
              {uiText('back', locale)}
            </button>
            <button type="button" onClick={reset} disabled={index === 0}>
              {uiText('reset', locale)}
            </button>
            <button type="button" onClick={tutorialNext}>
              {uiText(index === total - 1 ? 'finish' : 'next', locale)}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}

export default AssemblyTutorial;

const styles: Record<string, CSSProperties> = {
  panel: {
    maxWidth: 380,
    padding: 16,
    borderRadius: 8,
    background: 'rgba(20, 24, 28, 0.92)',
    color: '#f2f2f2',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { margin: 0, fontSize: 18 },
  muted: { opacity: 0.75, fontSize: 13 },
  dots: { display: 'flex', gap: 4, padding: 0, margin: '8px 0', listStyle: 'none' },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  recap: { opacity: 0.85, fontSize: 13 },
  footer: { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 },
};
