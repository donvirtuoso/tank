// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import lessons from '../../data/lessons.json';
import type { EducationEvent } from '../../stores/useEducationStore';

const lesson = lessons.lessons[0];
const ui = lessons.ui;

type StoreModule = typeof import('../../stores/useEducationStore');
let GuidedLesson: typeof import('./GuidedLesson')['GuidedLesson'];
let store: StoreModule['useEducationStore'];

beforeEach(async () => {
  window.localStorage.clear();
  vi.resetModules();
  ({ GuidedLesson } = await import('./GuidedLesson'));
  ({ useEducationStore: store } = await import('../../stores/useEducationStore'));
});

afterEach(cleanup);

const report = (event: EducationEvent) => act(() => store.getState().reportEvent(event));

function eventFor(index: number): EducationEvent | null {
  const rule = lesson.steps[index].completion as Record<string, unknown>;
  switch (rule.event) {
    case 'selection':
      return { type: 'selection', componentId: rule.componentId as string };
    case 'animation':
      return { type: 'animation', animationId: rule.animationId as string };
    case 'explode':
      return { type: 'explode', exploded: rule.exploded as boolean };
    default:
      return null;
  }
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('GuidedLesson', () => {
  it('disables Next on event-driven steps until the viewer event arrives', () => {
    render(<GuidedLesson locale="en" />);
    fireEvent.click(button(ui.next.en)); // manual intro
    expect(screen.getByText(lesson.steps[1].title.en)).toBeTruthy();
    expect(button(ui.next.en).disabled).toBe(true);
    expect(screen.getByText(ui.waitSelection.en)).toBeTruthy();

    report({ type: 'selection', componentId: 'not-the-hull' });
    expect(screen.getByText(lesson.steps[1].title.en)).toBeTruthy();

    report(eventFor(1)!);
    expect(screen.getByText(lesson.steps[2].title.en)).toBeTruthy();
  });

  it('completes all 7 steps, shows the completion screen and can restart', () => {
    render(<GuidedLesson locale="vi" />);
    lesson.steps.forEach((_, i) => {
      const event = eventFor(i);
      if (event) report(event);
      else fireEvent.click(button(ui.next.vi));
    });
    expect(screen.getByTestId('lesson-complete')).toBeTruthy();
    expect(screen.getByText(ui.lessonComplete.vi)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('7');

    fireEvent.click(button(ui.restartLesson.vi));
    expect(screen.getByText(lesson.steps[0].title.vi)).toBeTruthy();
  });

  it('stops the lesson when the panel is closed (unmounted)', () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return open ? <GuidedLesson locale="en" onClose={() => setOpen(false)} /> : null;
    }
    render(<Host />);
    fireEvent.click(button(ui.next.en));
    expect(store.getState().activeLessonId).toBe(lesson.id);

    fireEvent.click(button(ui.close.en));
    expect(store.getState().activeLessonId).toBeNull();

    report(eventFor(1)!);
    expect(store.getState().lessons[lesson.id].currentStep).toBe(1);
  });

  it('highlights the step target and keeps it with inline callbacks', () => {
    function Parent() {
      const [highlight, setHighlight] = useState<string | null>(null);
      return (
        <>
          <output data-testid="highlight">{highlight ?? 'none'}</output>
          <GuidedLesson locale="en" onHighlight={(id) => setHighlight(id)} />
        </>
      );
    }
    render(<Parent />);
    expect(screen.getByTestId('highlight').textContent).toBe('none'); // intro has no target
    fireEvent.click(button(ui.next.en));
    expect(screen.getByTestId('highlight').textContent).toBe(lesson.steps[1].target);
  });

  it('recovers from stored progress that no longer matches lessons.json', () => {
    window.localStorage.setItem(
      'tank.education.v1',
      JSON.stringify({ lessons: { [lesson.id]: { currentStep: 99, completedStepIds: ['gone'], completed: true } } }),
    );
    vi.resetModules();
    return Promise.all([import('./GuidedLesson'), import('../../stores/useEducationStore')]).then(
      ([{ GuidedLesson: Fresh }]) => {
        render(<Fresh locale="en" />);
        expect(screen.getByTestId('guided-lesson')).toBeTruthy();
        expect(screen.getByText(lesson.steps[lesson.steps.length - 1].title.en)).toBeTruthy();
      },
    );
  });
});
