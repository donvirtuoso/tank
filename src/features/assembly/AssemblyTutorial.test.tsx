// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import lessons from '../../data/lessons.json';

const steps = lessons.assemblyTutorial.steps;
const ui = lessons.ui;

type Module = typeof import('./AssemblyTutorial');
type StoreModule = typeof import('../../stores/useEducationStore');
let AssemblyTutorial: Module['AssemblyTutorial'];
let store: StoreModule['useEducationStore'];

beforeEach(async () => {
  window.localStorage.clear();
  // Fresh singleton store per test.
  vi.resetModules();
  ({ AssemblyTutorial } = await import('./AssemblyTutorial'));
  ({ useEducationStore: store } = await import('../../stores/useEducationStore'));
});

afterEach(cleanup);

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('AssemblyTutorial', () => {
  it('highlights, focuses the camera and plays the demo of the current step', () => {
    const onHighlight = vi.fn();
    const onFocusCamera = vi.fn();
    const onPlayAnimation = vi.fn();
    render(
      <AssemblyTutorial
        locale="en"
        onHighlight={onHighlight}
        onFocusCamera={onFocusCamera}
        onPlayAnimation={onPlayAnimation}
      />,
    );
    expect(onHighlight).toHaveBeenLastCalledWith(steps[0].target);
    expect(onFocusCamera).toHaveBeenLastCalledWith(steps[0].camera);
    expect(onPlayAnimation).toHaveBeenLastCalledWith(steps[0].animation);

    click(ui.next.en);
    expect(onHighlight).toHaveBeenLastCalledWith(steps[1].target);
    expect(onFocusCamera).toHaveBeenLastCalledWith(steps[1].camera);
    expect(onPlayAnimation).toHaveBeenLastCalledWith(steps[1].animation);

    click(`▶ ${ui.replayDemo.en}`);
    expect(onPlayAnimation).toHaveBeenCalledTimes(3);
  });

  it('keeps the highlight when the parent passes an inline callback that sets state', () => {
    const renders = vi.fn();
    function Parent() {
      const [highlight, setHighlight] = useState<string | null>(null);
      renders(highlight);
      return (
        <>
          <output data-testid="highlight">{highlight ?? 'none'}</output>
          <AssemblyTutorial locale="vi" onHighlight={(id) => setHighlight(id)} />
        </>
      );
    }
    render(<Parent />);
    expect(screen.getByTestId('highlight').textContent).toBe(steps[0].target);

    click(ui.next.vi);
    expect(screen.getByTestId('highlight').textContent).toBe(steps[1].target);
  });

  it('does not replay camera / animation when only callback identities change', () => {
    const onPlayAnimation = vi.fn();
    const { rerender } = render(
      <AssemblyTutorial locale="en" onPlayAnimation={(a) => onPlayAnimation(a)} />,
    );
    rerender(<AssemblyTutorial locale="en" onPlayAnimation={(a) => onPlayAnimation(a)} />);
    rerender(<AssemblyTutorial locale="vi" onPlayAnimation={(a) => onPlayAnimation(a)} />);
    expect(onPlayAnimation).toHaveBeenCalledTimes(1);
  });

  it('reports direction and assembled parts on Next / Back / Reset', () => {
    const onStepChange = vi.fn();
    render(<AssemblyTutorial locale="en" onStepChange={onStepChange} />);
    expect(onStepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 0, direction: 'initial', assembledParts: [] }),
    );

    click(ui.next.en);
    click(ui.next.en);
    expect(onStepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 2, direction: 'forward', assembledParts: [steps[0].target, steps[1].target] }),
    );

    click(ui.back.en);
    expect(onStepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 1, previousPosition: 2, direction: 'backward', assembledParts: [steps[0].target] }),
    );

    click(ui.reset.en);
    expect(onStepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 0, direction: 'reset', assembledParts: [] }),
    );
    expect(store.getState().tutorial).toEqual({ currentStep: 0, completed: false });
  });

  it('shows the summary after the last step, then goes back or restarts', () => {
    const onHighlight = vi.fn();
    const onStepChange = vi.fn();
    render(<AssemblyTutorial locale="en" onHighlight={onHighlight} onStepChange={onStepChange} />);

    for (let i = 0; i < steps.length - 1; i++) click(ui.next.en);
    click(ui.finish.en);

    expect(screen.getByTestId('assembly-summary')).toBeTruthy();
    expect(screen.getByText(lessons.assemblyTutorial.summary.title.en)).toBeTruthy();
    expect(onHighlight).toHaveBeenLastCalledWith(null);
    expect(onStepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ summary: true, assembledParts: steps.map((s) => s.target) }),
    );

    click(ui.back.en);
    expect(screen.queryByTestId('assembly-summary')).toBeNull();
    expect(screen.getByText(steps[steps.length - 1].title.en)).toBeTruthy();

    click(ui.finish.en);
    click(ui.restartTutorial.en);
    expect(screen.getByText(steps[0].title.en)).toBeTruthy();
    expect(onStepChange).toHaveBeenLastCalledWith(expect.objectContaining({ position: 0, direction: 'reset' }));
  });

  it('persists progress across remounts', () => {
    const { unmount } = render(<AssemblyTutorial locale="en" />);
    click(ui.next.en);
    unmount();
    render(<AssemblyTutorial locale="en" />);
    expect(screen.getByText(steps[1].title.en)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('tank.education.v1')!).tutorial.currentStep).toBe(1);
  });

  it('clears the highlight on unmount only', () => {
    const onHighlight = vi.fn();
    const { rerender, unmount } = render(<AssemblyTutorial locale="en" onHighlight={onHighlight} />);
    rerender(<AssemblyTutorial locale="en" onHighlight={(id) => onHighlight(id)} />);
    expect(onHighlight).not.toHaveBeenCalledWith(null);
    act(() => unmount());
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });
});
