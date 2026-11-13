import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import {
  educationContent,
  localize,
  uiText,
  useEducationStore,
  type Locale,
} from '../../stores/useEducationStore';

export interface OnboardingProps {
  locale: Locale;
  /** Called when the user presses "Start exploring". */
  onStartExplore?: () => void;
  /**
   * CSS selector for the component explorer to highlight. The explorer should carry
   * `data-tour="component-explorer"` (matches the page's `highlight` id by default).
   */
  explorerSelector?: string;
}

type Rect = { top: number; left: number; width: number; height: number };

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/**
 * Tracks the bounding rect of `selector`. Re-measures on resize / scroll, when the
 * DOM changes (MutationObserver – e.g. the explorer renders after the overlay
 * because the scene loads slowly) and when the element itself resizes (ResizeObserver).
 */
function useElementRect(selector: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector || typeof document === 'undefined') {
      setRect(null);
      return;
    }
    let observed: Element | null = null;
    let frame: number | null = null;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : null;

    const measure = () => {
      frame = null;
      const el = document.querySelector(selector);
      if (el !== observed) {
        if (observed) resizeObserver?.unobserve(observed);
        if (el) resizeObserver?.observe(el);
        observed = el;
      }
      const next = el
        ? (({ top, left, width, height }) => ({ top, left, width, height }))(el.getBoundingClientRect())
        : null;
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (frame !== null) return;
      frame =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(measure)
          : (setTimeout(measure, 16) as unknown as number);
    };

    measure();
    const mutationObserver =
      typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    mutationObserver?.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (frame !== null) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
        else clearTimeout(frame);
      }
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [selector]);

  return rect;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab / Shift+Tab inside the dialog and restores focus when it closes. */
function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  // Captured during render: by the time effects run, `autoFocus` has already moved focus.
  const restoreTo = useRef<HTMLElement | null>(null);
  if (active && restoreTo.current === null && typeof document !== 'undefined') {
    restoreTo.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const root = ref.current;
      if (e.key !== 'Tab' || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const target = restoreTo.current;
      restoreTo.current = null;
      if (target && typeof target.focus === 'function' && target.isConnected) target.focus();
    };
  }, [ref, active]);
}

/**
 * First-run welcome overlay: welcome → mouse controls → component explorer highlight
 * → "Start exploring". Shown automatically until completed once; can be reopened from
 * Settings via <OnboardingReopenButton/> or `useEducationStore.getState().reopenOnboarding()`.
 */
export function Onboarding({ locale, onStartExplore, explorerSelector }: OnboardingProps) {
  const open = useEducationStore((s) => s.onboardingOpen);
  const { completeOnboarding } = useEducationStore.getState();
  const pages = educationContent.onboarding.pages;
  const [pageIndex, setPageIndex] = useState(0);

  // Always restart from the first page when (re)opened.
  useEffect(() => {
    if (open) setPageIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') completeOnboarding();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, completeOnboarding]);

  const page = pages[pageIndex];
  const highlightSelector =
    open && page?.highlight ? (explorerSelector ?? `[data-tour="${page.highlight}"]`) : null;
  const rect = useElementRect(highlightSelector);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  if (!open || !page) return null;

  const isLast = pageIndex === pages.length - 1;
  const start = () => {
    completeOnboarding();
    onStartExplore?.();
  };

  return (
    <div style={styles.backdrop} data-testid="onboarding">
      {rect && (
        <div
          data-testid="onboarding-highlight"
          style={{
            ...styles.highlight,
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        style={styles.dialog}
      >
        <h2 id="onboarding-title" style={{ marginTop: 0 }}>
          {localize(page.title, locale)}
        </h2>
        <p>{localize(page.content, locale)}</p>

        {page.controls && (
          <table style={styles.table}>
            <tbody>
              {page.controls.map((c) => (
                <tr key={c.id}>
                  <th scope="row" style={styles.cell}>
                    {localize(c.input, locale)}
                  </th>
                  <td style={styles.cell}>{localize(c.action, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={styles.dots} aria-hidden="true">
          {pages.map((p, i) => (
            <span key={p.id} style={{ ...styles.dot, opacity: i === pageIndex ? 1 : 0.35 }} />
          ))}
        </div>

        <footer style={styles.footer}>
          <button type="button" onClick={completeOnboarding}>
            {uiText('skip', locale)}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {pageIndex > 0 && (
              <button type="button" onClick={() => setPageIndex((i) => i - 1)}>
                {uiText('back', locale)}
              </button>
            )}
            {isLast ? (
              <button type="button" onClick={start} autoFocus>
                {localize(educationContent.onboarding.startExplore, locale)}
              </button>
            ) : (
              <button type="button" onClick={() => setPageIndex((i) => i + 1)} autoFocus>
                {uiText('next', locale)}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Button for the Settings panel to show the welcome guide again. */
export function OnboardingReopenButton({ locale }: { locale: Locale }) {
  const reopen = useEducationStore((s) => s.reopenOnboarding);
  return (
    <button type="button" onClick={reopen}>
      {uiText('reopenOnboarding', locale)}
    </button>
  );
}

export default Onboarding;

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlight: {
    position: 'fixed',
    borderRadius: 8,
    border: '3px solid #f5c542',
    boxShadow: '0 0 0 4px rgba(245, 197, 66, 0.35)',
    pointerEvents: 'none',
  },
  dialog: {
    position: 'relative',
    width: 'min(440px, 92vw)',
    padding: 24,
    borderRadius: 10,
    background: '#1c2126',
    color: '#f2f2f2',
    boxShadow: '0 12px 40px rgba(0,0,0,.5)',
  },
  table: { width: '100%', borderCollapse: 'collapse', margin: '8px 0' },
  cell: { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #333' },
  dots: { display: 'flex', gap: 6, justifyContent: 'center', margin: '12px 0' },
  dot: { width: 8, height: 8, borderRadius: '50%', background: '#f2f2f2' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
};
