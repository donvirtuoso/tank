// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import lessons from '../../data/lessons.json';

const { pages, startExplore } = lessons.onboarding;
const ui = lessons.ui;
const STORAGE_KEY = 'tank.education.v1';

type OnboardingModule = typeof import('./Onboarding');
let Onboarding: OnboardingModule['Onboarding'];
let OnboardingReopenButton: OnboardingModule['OnboardingReopenButton'];

async function loadFresh() {
  vi.resetModules();
  ({ Onboarding, OnboardingReopenButton } = await import('./Onboarding'));
}

beforeEach(async () => {
  window.localStorage.clear();
  await loadFresh();
});

afterEach(cleanup);

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('Onboarding', () => {
  it('walks welcome → mouse controls → explorer and starts exploring', () => {
    const onStartExplore = vi.fn();
    render(<Onboarding locale="en" onStartExplore={onStartExplore} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(pages[0].title.en)).toBeTruthy();

    click(ui.next.en);
    expect(screen.getByText(pages[1].title.en)).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(pages[1].controls!.length);

    click(ui.next.en);
    click(startExplore.en);
    expect(onStartExplore).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('onboarding')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).onboardingCompleted).toBe(true);
  });

  it('is shown only on the first run', async () => {
    render(<Onboarding locale="vi" />);
    click(ui.skip.vi);
    cleanup();

    await loadFresh(); // simulates a reload
    render(<Onboarding locale="vi" />);
    expect(screen.queryByTestId('onboarding')).toBeNull();
  });

  it('Escape marks onboarding as completed', () => {
    render(<Onboarding locale="en" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('onboarding')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).onboardingCompleted).toBe(true);
  });

  it('can be reopened from Settings and restarts at the first page', () => {
    render(
      <>
        <Onboarding locale="en" />
        <OnboardingReopenButton locale="en" />
      </>,
    );
    click(ui.next.en);
    click(ui.skip.en);
    expect(screen.queryByTestId('onboarding')).toBeNull();

    click(ui.reopenOnboarding.en);
    expect(screen.getByTestId('onboarding')).toBeTruthy();
    expect(screen.getByText(pages[0].title.en)).toBeTruthy();
  });

  it('highlights the component explorer even when it renders after the overlay', async () => {
    render(<Onboarding locale="en" />);
    click(ui.next.en);
    click(ui.next.en);
    expect(screen.queryByTestId('onboarding-highlight')).toBeNull();

    const explorer = document.createElement('aside');
    explorer.setAttribute('data-tour', 'component-explorer');
    act(() => {
      document.body.appendChild(explorer);
    });
    await waitFor(() => expect(screen.getByTestId('onboarding-highlight')).toBeTruthy());
    explorer.remove();
  });

  it('traps Tab focus inside the dialog', () => {
    render(<Onboarding locale="en" />);
    const dialog = screen.getByRole('dialog');
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
