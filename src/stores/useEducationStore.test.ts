import { beforeEach, describe, expect, it } from 'vitest';
import {
  EDUCATION_STORAGE_KEY,
  createEducationStore,
  educationContent,
  eventMatchesRule,
  uiText,
  type EducationEvent,
} from './useEducationStore';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const lesson = educationContent.lessons[0];
const tutorialLength = educationContent.assemblyTutorial.steps.length;

/** Event that satisfies each lesson step (null = manual "Next"). */
function eventFor(stepIndex: number): EducationEvent | null {
  const rule = lesson.steps[stepIndex].completion;
  switch (rule.event) {
    case 'selection':
      return { type: 'selection', componentId: rule.componentId };
    case 'animation':
      return { type: 'animation', animationId: rule.animationId };
    case 'explode':
      return { type: 'explode', exploded: rule.exploded };
    default:
      return null;
  }
}

describe('useEducationStore', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe('guided lesson', () => {
    it('defines the 7-step "tank anatomy" lesson using selection/animation/explode events', () => {
      expect(lesson.steps).toHaveLength(7);
      const events = new Set(lesson.steps.map((s) => s.completion.event));
      expect(events).toEqual(new Set(['manual', 'selection', 'animation', 'explode']));
    });

    it('completes all 7 steps via events and persists progress', () => {
      const store = createEducationStore(storage);
      store.getState().startLesson(lesson.id);

      lesson.steps.forEach((_, i) => {
        const event = eventFor(i);
        if (event) store.getState().reportEvent(event);
        else store.getState().nextLessonStep();
      });

      const progress = store.getState().lessons[lesson.id];
      expect(progress.completed).toBe(true);
      expect(progress.completedStepIds).toEqual(lesson.steps.map((s) => s.id));

      // A fresh store reads the saved progress back from storage.
      const reloaded = createEducationStore(storage);
      expect(reloaded.getState().lessons[lesson.id].completed).toBe(true);
    });

    it('ignores non-matching events and blocks Next on event-driven steps', () => {
      const store = createEducationStore(storage);
      store.getState().startLesson(lesson.id);
      store.getState().nextLessonStep(); // manual intro
      expect(store.getState().lessons[lesson.id].currentStep).toBe(1);

      store.getState().reportEvent({ type: 'selection', componentId: 'something-else' });
      store.getState().nextLessonStep();
      expect(store.getState().lessons[lesson.id].currentStep).toBe(1);

      store.getState().reportEvent(eventFor(1)!);
      expect(store.getState().lessons[lesson.id].currentStep).toBe(2);
    });

    it('ignores events when no lesson is active', () => {
      const store = createEducationStore(storage);
      store.getState().reportEvent({ type: 'explode', exploded: true });
      expect(store.getState().lessons).toEqual({});
    });

    it('resumes saved progress and supports back/forward over completed steps', () => {
      const first = createEducationStore(storage);
      first.getState().startLesson(lesson.id);
      first.getState().nextLessonStep();
      first.getState().reportEvent(eventFor(1)!);

      const store = createEducationStore(storage);
      store.getState().startLesson(lesson.id);
      expect(store.getState().lessons[lesson.id].currentStep).toBe(2);

      store.getState().prevLessonStep();
      expect(store.getState().lessons[lesson.id].currentStep).toBe(1);
      store.getState().nextLessonStep(); // step 1 already done -> navigate forward
      expect(store.getState().lessons[lesson.id].currentStep).toBe(2);
    });

    it('resets a lesson', () => {
      const store = createEducationStore(storage);
      store.getState().startLesson(lesson.id);
      store.getState().nextLessonStep();
      store.getState().resetLesson(lesson.id);
      expect(store.getState().lessons[lesson.id]).toEqual({
        currentStep: 0,
        completedStepIds: [],
        completed: false,
      });
    });

    it('stops reacting to viewer events after stopLesson', () => {
      const store = createEducationStore(storage);
      store.getState().startLesson(lesson.id);
      store.getState().nextLessonStep();
      store.getState().stopLesson(lesson.id);
      expect(store.getState().activeLessonId).toBeNull();

      store.getState().reportEvent(eventFor(1)!);
      expect(store.getState().lessons[lesson.id].currentStep).toBe(1);
    });

    it('stopLesson leaves a different active lesson untouched', () => {
      const store = createEducationStore(storage);
      store.getState().startLesson(lesson.id);
      store.getState().stopLesson('another-lesson');
      expect(store.getState().activeLessonId).toBe(lesson.id);
      store.getState().stopLesson();
      expect(store.getState().activeLessonId).toBeNull();
    });

    it('only completes animation steps when the animation ends', () => {
      const rule = { event: 'animation', animationId: 'a' } as const;
      expect(eventMatchesRule(rule, { type: 'animation', animationId: 'a', phase: 'start' })).toBe(false);
      expect(eventMatchesRule(rule, { type: 'animation', animationId: 'a', phase: 'end' })).toBe(true);
      expect(eventMatchesRule(rule, { type: 'animation', animationId: 'a' })).toBe(true);
    });
  });

  describe('assembly tutorial', () => {
    it('moves next/prev, shows summary at the end and resets', () => {
      const store = createEducationStore(storage);
      store.getState().tutorialPrev(); // no-op at the first step
      expect(store.getState().tutorial).toEqual({ currentStep: 0, completed: false });

      store.getState().tutorialNext();
      store.getState().tutorialNext();
      store.getState().tutorialPrev();
      expect(store.getState().tutorial.currentStep).toBe(1);

      for (let i = 0; i < tutorialLength; i++) store.getState().tutorialNext();
      expect(store.getState().tutorial).toEqual({ currentStep: tutorialLength - 1, completed: true });

      store.getState().tutorialPrev(); // back from summary to the last step
      expect(store.getState().tutorial).toEqual({ currentStep: tutorialLength - 1, completed: false });

      store.getState().tutorialReset();
      expect(store.getState().tutorial).toEqual({ currentStep: 0, completed: false });
    });

    it('persists tutorial progress', () => {
      const store = createEducationStore(storage);
      store.getState().tutorialNext();
      expect(createEducationStore(storage).getState().tutorial.currentStep).toBe(1);
    });
  });

  describe('onboarding', () => {
    it('is shown only on first run and can be reopened', () => {
      const first = createEducationStore(storage);
      expect(first.getState().onboardingOpen).toBe(true);
      first.getState().completeOnboarding();
      expect(first.getState().onboardingOpen).toBe(false);

      const second = createEducationStore(storage);
      expect(second.getState().onboardingOpen).toBe(false);
      second.getState().reopenOnboarding();
      expect(second.getState().onboardingOpen).toBe(true);
      second.getState().completeOnboarding();
      expect(second.getState().onboardingOpen).toBe(false);
    });

    it('notifies subscribers on change', () => {
      const store = createEducationStore(storage);
      let calls = 0;
      const unsubscribe = store.subscribe(() => calls++);
      store.getState().completeOnboarding();
      unsubscribe();
      store.getState().reopenOnboarding();
      expect(calls).toBe(1);
    });
  });

  describe('storage robustness', () => {
    it('falls back to defaults on corrupted storage', () => {
      storage.setItem(EDUCATION_STORAGE_KEY, '{not json');
      const store = createEducationStore(storage);
      expect(store.getState().onboardingCompleted).toBe(false);
      expect(store.getState().lessons).toEqual({});
    });

    it('works without storage', () => {
      const store = createEducationStore(null);
      store.getState().completeOnboarding();
      expect(store.getState().onboardingCompleted).toBe(true);
    });

    it('clamps out-of-range steps and drops unknown step ids after content changes', () => {
      storage.setItem(
        EDUCATION_STORAGE_KEY,
        JSON.stringify({
          lessons: {
            [lesson.id]: {
              currentStep: 42,
              completedStepIds: ['intro', 'removed-step', 'intro', 7],
              completed: true,
            },
          },
          tutorial: { currentStep: 99, completed: false },
        }),
      );
      const store = createEducationStore(storage);
      expect(store.getState().lessons[lesson.id]).toEqual({
        currentStep: lesson.steps.length - 1,
        completedStepIds: ['intro'],
        completed: false, // not every current step is done
      });
      expect(store.getState().tutorial.currentStep).toBe(tutorialLength - 1);

      // A single Back is enough to leave the last tutorial step.
      store.getState().tutorialPrev();
      expect(store.getState().tutorial.currentStep).toBe(tutorialLength - 2);
    });

    it('Finish on the last step jumps to the first unfinished step instead of doing nothing', () => {
      const lastId = lesson.steps[lesson.steps.length - 1].id;
      storage.setItem(
        EDUCATION_STORAGE_KEY,
        JSON.stringify({
          lessons: {
            [lesson.id]: { currentStep: lesson.steps.length - 1, completedStepIds: ['intro'], completed: false },
          },
        }),
      );
      const store = createEducationStore(storage);
      store.getState().startLesson(lesson.id);
      store.getState().reportEvent(eventFor(lesson.steps.length - 1)!);
      const progress = store.getState().lessons[lesson.id];
      expect(progress.completed).toBe(false);
      expect(progress.completedStepIds).toContain(lastId);
      expect(progress.currentStep).toBe(1);
    });

    it('ignores prototype-polluting and unknown lesson keys', () => {
      storage.setItem(
        EDUCATION_STORAGE_KEY,
        '{"lessons":{"__proto__":{"currentStep":1},"constructor":{},"unknown":{"currentStep":2}}}',
      );
      const store = createEducationStore(storage);
      const lessons = store.getState().lessons;
      expect(Object.keys(lessons)).toEqual([]);
      expect(Object.getPrototypeOf(lessons)).toBe(Object.prototype);
      expect(({} as Record<string, unknown>).currentStep).toBeUndefined();
    });
  });

  describe('cross-tab sync', () => {
    const storageEvent = (key: string | null) => Object.assign(new Event('storage'), { key });

    it('adopts progress written by another tab instead of overwriting it', () => {
      const target = new EventTarget();
      const tabA = createEducationStore(storage, educationContent, target);
      const tabB = createEducationStore(storage, educationContent, target);

      tabB.getState().completeOnboarding();
      tabB.getState().tutorialNext();
      target.dispatchEvent(storageEvent(EDUCATION_STORAGE_KEY));

      expect(tabA.getState().onboardingCompleted).toBe(true);
      expect(tabA.getState().onboardingOpen).toBe(false);
      expect(tabA.getState().tutorial.currentStep).toBe(1);

      // tabA's next write keeps tabB's progress.
      tabA.getState().tutorialNext();
      const saved = JSON.parse(storage.getItem(EDUCATION_STORAGE_KEY)!);
      expect(saved.onboardingCompleted).toBe(true);
      expect(saved.tutorial.currentStep).toBe(2);

      tabA.destroy();
      tabB.destroy();
    });

    it('ignores storage events for other keys and stops listening after destroy', () => {
      const target = new EventTarget();
      const tab = createEducationStore(storage, educationContent, target);
      const other = createEducationStore(storage, educationContent, null);
      other.getState().completeOnboarding();

      target.dispatchEvent(storageEvent('some.other.key'));
      expect(tab.getState().onboardingCompleted).toBe(false);

      tab.destroy();
      target.dispatchEvent(storageEvent(EDUCATION_STORAGE_KEY));
      expect(tab.getState().onboardingCompleted).toBe(false);
    });
  });

  it('localizes UI text with placeholders', () => {
    expect(uiText('stepOf', 'vi', { current: 2, total: 7 })).toBe('Bước 2/7');
    expect(uiText('stepOf', 'en', { current: 2, total: 7 })).toBe('Step 2/7');
  });
});
