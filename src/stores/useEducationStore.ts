import { useSyncExternalStore } from 'react';
import lessonsJson from '../data/lessons.json';
import glossaryJson from '../data/glossary.json';

/* ------------------------------------------------------------------ */
/* Content types                                                       */
/* ------------------------------------------------------------------ */

export type Locale = 'vi' | 'en';

export interface LocalizedText {
  vi: string;
  en: string;
}

export type CompletionRule =
  | { event: 'manual' }
  | { event: 'selection'; componentId: string }
  | { event: 'animation'; animationId: string }
  | { event: 'explode'; exploded: boolean };

export interface LessonStep {
  id: string;
  title: LocalizedText;
  content: LocalizedText;
  /** Component id to highlight in the 3D scene. */
  target?: string;
  completion: CompletionRule;
}

export interface Lesson {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  steps: LessonStep[];
}

export type Vec3 = [number, number, number];

export interface CameraFocus {
  position: Vec3;
  target: Vec3;
}

export interface TutorialAnimation {
  id: string;
}

export interface TutorialStep {
  id: string;
  title: LocalizedText;
  content: LocalizedText;
  target: string;
  camera: CameraFocus;
  animation: TutorialAnimation;
}

export interface AssemblyTutorialDef {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  steps: TutorialStep[];
  summary: { title: LocalizedText; content: LocalizedText; points: LocalizedText[] };
}

export interface OnboardingControl {
  id: string;
  input: LocalizedText;
  action: LocalizedText;
}

export interface OnboardingPage {
  id: string;
  title: LocalizedText;
  content: LocalizedText;
  controls?: OnboardingControl[];
  highlight?: string;
}

export interface EducationContent {
  ui: Record<string, LocalizedText>;
  onboarding: { pages: OnboardingPage[]; startExplore: LocalizedText };
  lessons: Lesson[];
  assemblyTutorial: AssemblyTutorialDef;
}

export interface GlossaryEntry {
  term: LocalizedText;
  definition: LocalizedText;
}

export const educationContent = lessonsJson as unknown as EducationContent;
export const glossary = (glossaryJson as unknown as { terms: Record<string, GlossaryEntry> }).terms;

export function localize(text: LocalizedText | undefined, locale: Locale): string {
  if (!text) return '';
  return text[locale] || text.vi || text.en || '';
}

/** Localized UI string from lessons.json `ui`, with `{name}` placeholder substitution. */
export function uiText(key: string, locale: Locale, params: Record<string, string | number> = {}): string {
  const raw = localize(educationContent.ui[key], locale) || key;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function getLesson(lessonId: string): Lesson | undefined {
  return educationContent.lessons.find((l) => l.id === lessonId);
}

/* ------------------------------------------------------------------ */
/* Events reported by the viewer (selection / animation / explode)     */
/* ------------------------------------------------------------------ */

export type EducationEvent =
  | { type: 'selection'; componentId: string | null }
  /** `phase` defaults to 'end'; only finished animations complete a step. */
  | { type: 'animation'; animationId: string; phase?: 'start' | 'end' }
  | { type: 'explode'; exploded: boolean };

export function eventMatchesRule(rule: CompletionRule, event: EducationEvent): boolean {
  switch (rule.event) {
    case 'selection':
      return event.type === 'selection' && event.componentId === rule.componentId;
    case 'animation':
      return (
        event.type === 'animation' &&
        event.animationId === rule.animationId &&
        (event.phase ?? 'end') === 'end'
      );
    case 'explode':
      return event.type === 'explode' && event.exploded === rule.exploded;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export interface LessonProgress {
  currentStep: number;
  completedStepIds: string[];
  completed: boolean;
}

export interface TutorialProgress {
  currentStep: number;
  completed: boolean;
}

export interface PersistedEducationState {
  onboardingCompleted: boolean;
  lessons: Record<string, LessonProgress>;
  tutorial: TutorialProgress;
}

export interface EducationActions {
  startLesson: (lessonId: string) => void;
  /** Deactivates the lesson (if it is the active one) so viewer events stop advancing it. */
  stopLesson: (lessonId?: string) => void;
  /** Forward a viewer event; advances the active lesson if it satisfies the current step. */
  reportEvent: (event: EducationEvent) => void;
  /** Next: completes a manual step, or navigates forward over an already completed step. */
  nextLessonStep: () => void;
  prevLessonStep: () => void;
  resetLesson: (lessonId: string) => void;
  tutorialNext: () => void;
  tutorialPrev: () => void;
  tutorialReset: () => void;
  completeOnboarding: () => void;
  reopenOnboarding: () => void;
}

export interface EducationState extends PersistedEducationState, EducationActions {
  onboardingOpen: boolean;
  activeLessonId: string | null;
}

export const EDUCATION_STORAGE_KEY = 'tank.education.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const emptyLessonProgress = (): LessonProgress => ({
  currentStep: 0,
  completedStepIds: [],
  completed: false,
});

const emptyTutorialProgress = (): TutorialProgress => ({ currentStep: 0, completed: false });

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

const clampIndex = (value: unknown, length: number): number =>
  Number.isInteger(value) ? Math.min(Math.max(value as number, 0), Math.max(length - 1, 0)) : 0;

/**
 * Normalizes lesson progress against the current lesson definition: drops step ids
 * that no longer exist, clamps currentStep into range and only keeps `completed`
 * when every current step is done (lessons.json may change between releases).
 */
export function sanitizeLessonProgress(lesson: Lesson, raw: unknown): LessonProgress {
  if (!raw || typeof raw !== 'object') return emptyLessonProgress();
  const p = raw as Partial<LessonProgress>;
  const validIds = new Set(lesson.steps.map((s) => s.id));
  const completedStepIds = Array.isArray(p.completedStepIds)
    ? p.completedStepIds.filter(
        (s, i, arr): s is string => typeof s === 'string' && validIds.has(s) && arr.indexOf(s) === i,
      )
    : [];
  const allDone = lesson.steps.length > 0 && lesson.steps.every((s) => completedStepIds.includes(s.id));
  return {
    currentStep: clampIndex(p.currentStep, lesson.steps.length),
    completedStepIds,
    completed: p.completed === true && allDone,
  };
}

function sanitizeTutorialProgress(raw: unknown, length: number): TutorialProgress {
  if (!raw || typeof raw !== 'object') return emptyTutorialProgress();
  const t = raw as Partial<TutorialProgress>;
  return { currentStep: clampIndex(t.currentStep, length), completed: t.completed === true };
}

function loadPersisted(storage: StorageLike | null, content: EducationContent): PersistedEducationState {
  const fallback: PersistedEducationState = {
    onboardingCompleted: false,
    lessons: {},
    tutorial: emptyTutorialProgress(),
  };
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(EDUCATION_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedEducationState> | null;
    if (!parsed || typeof parsed !== 'object') return fallback;
    const lessons: Record<string, LessonProgress> = {};
    const storedLessons = (
      parsed.lessons && typeof parsed.lessons === 'object' ? parsed.lessons : {}
    ) as Record<string, unknown>;
    // Iterate over known lessons only: unknown / hostile keys (`__proto__`, ...) are ignored.
    for (const lesson of content.lessons) {
      if (!Object.prototype.hasOwnProperty.call(storedLessons, lesson.id)) continue;
      lessons[lesson.id] = sanitizeLessonProgress(lesson, storedLessons[lesson.id]);
    }
    return {
      onboardingCompleted: parsed.onboardingCompleted === true,
      lessons,
      tutorial: sanitizeTutorialProgress(parsed.tutorial, content.assemblyTutorial.steps.length),
    };
  } catch {
    return fallback;
  }
}

export interface EducationStore {
  getState: () => EducationState;
  subscribe: (listener: () => void) => () => void;
  /** Removes the cross-tab `storage` listener. */
  destroy: () => void;
}

type StorageEventTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

function defaultEventTarget(): StorageEventTarget | null {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
}

export function createEducationStore(
  storage: StorageLike | null = defaultStorage(),
  content: EducationContent = educationContent,
  /** Receives `storage` events from other tabs (defaults to `window`). */
  eventTarget: StorageEventTarget | null = defaultEventTarget(),
): EducationStore {
  const listeners = new Set<() => void>();
  let state: EducationState;

  const persist = () => {
    if (!storage) return;
    const data: PersistedEducationState = {
      onboardingCompleted: state.onboardingCompleted,
      lessons: state.lessons,
      tutorial: state.tutorial,
    };
    try {
      storage.setItem(EDUCATION_STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or unavailable – progress just isn't saved */
    }
  };

  const setState = (partial: Partial<EducationState>, { save = true } = {}) => {
    state = { ...state, ...partial };
    if (save) persist();
    listeners.forEach((l) => l());
  };

  const findLesson = (id: string) => content.lessons.find((l) => l.id === id);

  const progressOf = (id: string): LessonProgress => state.lessons[id] ?? emptyLessonProgress();

  const setLessonProgress = (id: string, progress: LessonProgress) =>
    setState({ lessons: { ...state.lessons, [id]: progress } });

  /** Marks the current step done and moves forward (or finishes the lesson). */
  const completeCurrentStep = (lesson: Lesson, progress: LessonProgress) => {
    const step = lesson.steps[progress.currentStep];
    if (!step) return;
    const completedStepIds = progress.completedStepIds.includes(step.id)
      ? progress.completedStepIds
      : [...progress.completedStepIds, step.id];
    const isLast = progress.currentStep >= lesson.steps.length - 1;
    if (!isLast) {
      setLessonProgress(lesson.id, {
        completedStepIds,
        currentStep: progress.currentStep + 1,
        completed: false,
      });
      return;
    }
    // On the last step: finish only if every step is done, otherwise jump to the
    // first unfinished step so "Finish" never silently does nothing.
    const firstPending = lesson.steps.findIndex((s) => !completedStepIds.includes(s.id));
    setLessonProgress(lesson.id, {
      completedStepIds,
      currentStep: firstPending === -1 ? progress.currentStep : firstPending,
      completed: firstPending === -1,
    });
  };

  const tutorialLength = () => content.assemblyTutorial.steps.length;

  const persisted = loadPersisted(storage, content);

  state = {
    ...persisted,
    onboardingOpen: !persisted.onboardingCompleted,
    activeLessonId: null,

    startLesson: (lessonId) => {
      const lesson = findLesson(lessonId);
      if (!lesson) return;
      setState({
        activeLessonId: lessonId,
        lessons: { ...state.lessons, [lessonId]: sanitizeLessonProgress(lesson, progressOf(lessonId)) },
      });
    },

    stopLesson: (lessonId) => {
      if (state.activeLessonId === null) return;
      if (lessonId !== undefined && state.activeLessonId !== lessonId) return;
      setState({ activeLessonId: null }, { save: false });
    },

    reportEvent: (event) => {
      const id = state.activeLessonId;
      if (!id) return;
      const lesson = findLesson(id);
      const progress = progressOf(id);
      if (!lesson || progress.completed) return;
      const step = lesson.steps[progress.currentStep];
      if (!step || progress.completedStepIds.includes(step.id)) return;
      if (eventMatchesRule(step.completion, event)) completeCurrentStep(lesson, progress);
    },

    nextLessonStep: () => {
      const id = state.activeLessonId;
      if (!id) return;
      const lesson = findLesson(id);
      const progress = progressOf(id);
      if (!lesson || progress.completed) return;
      const step = lesson.steps[progress.currentStep];
      if (!step) return;
      const done = progress.completedStepIds.includes(step.id);
      if (!done && step.completion.event !== 'manual') return;
      completeCurrentStep(lesson, progress);
    },

    prevLessonStep: () => {
      const id = state.activeLessonId;
      if (!id) return;
      const progress = progressOf(id);
      if (progress.completed || progress.currentStep === 0) return;
      setLessonProgress(id, { ...progress, currentStep: progress.currentStep - 1 });
    },

    resetLesson: (lessonId) => setLessonProgress(lessonId, emptyLessonProgress()),

    tutorialNext: () => {
      const { currentStep, completed } = state.tutorial;
      if (completed) return;
      if (currentStep >= tutorialLength() - 1) {
        setState({ tutorial: { currentStep, completed: true } });
      } else {
        setState({ tutorial: { currentStep: currentStep + 1, completed: false } });
      }
    },

    tutorialPrev: () => {
      const { currentStep, completed } = state.tutorial;
      if (completed) {
        setState({ tutorial: { currentStep: tutorialLength() - 1, completed: false } });
      } else if (currentStep > 0) {
        setState({ tutorial: { currentStep: currentStep - 1, completed: false } });
      }
    },

    tutorialReset: () => setState({ tutorial: emptyTutorialProgress() }),

    completeOnboarding: () => setState({ onboardingCompleted: true, onboardingOpen: false }),

    reopenOnboarding: () => setState({ onboardingOpen: true }),
  };

  // Cross-tab sync: another tab wrote progress -> adopt it, so our next write
  // doesn't overwrite that tab's progress with a stale snapshot.
  const onStorage = (event: Event) => {
    const e = event as StorageEvent;
    if (!storage) return;
    if (e.key !== EDUCATION_STORAGE_KEY && e.key !== null) return;
    if (e.storageArea && storage && e.storageArea !== (storage as unknown)) return;
    const next = loadPersisted(storage, content);
    setState(
      {
        ...next,
        // Onboarding finished elsewhere: close it here as well.
        onboardingOpen: state.onboardingOpen && !(next.onboardingCompleted && !state.onboardingCompleted),
      },
      { save: false },
    );
  };
  eventTarget?.addEventListener('storage', onStorage);

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy: () => eventTarget?.removeEventListener('storage', onStorage),
  };
}

const educationStore = createEducationStore();

/**
 * Hook with a zustand-like API: `useEducationStore((s) => s.tutorial)`.
 * Selectors should return stable references (state slices or primitives).
 */
export const useEducationStore = Object.assign(
  <T>(selector: (state: EducationState) => T): T =>
    useSyncExternalStore(
      educationStore.subscribe,
      () => selector(educationStore.getState()),
      () => selector(educationStore.getState()),
    ),
  {
    getState: educationStore.getState,
    subscribe: educationStore.subscribe,
  },
);
