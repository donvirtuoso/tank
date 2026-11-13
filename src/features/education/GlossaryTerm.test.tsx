// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import glossary from '../../data/glossary.json';
import { GlossaryTerm, RichText } from './GlossaryTerm';

const hull = (glossary.terms as Record<string, { term: { vi: string; en: string }; definition: { vi: string; en: string } }>).hull;

afterEach(cleanup);

describe('GlossaryTerm', () => {
  it('shows the localized definition on hover', () => {
    render(<GlossaryTerm termId="hull" locale="en" />);
    const term = screen.getByText(hull.term.en);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(term);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain(hull.definition.en);
    expect(term.getAttribute('aria-describedby')).toBe(tooltip.id);

    fireEvent.mouseLeave(term);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the tooltip on keyboard focus', () => {
    render(<GlossaryTerm termId="hull" locale="vi" />);
    const term = screen.getByText(hull.term.vi);
    fireEvent.focus(term);
    expect(screen.getByRole('tooltip').textContent).toContain(hull.definition.vi);
    fireEvent.blur(term);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders unknown terms as plain text', () => {
    const { container } = render(<GlossaryTerm termId="nope" locale="en" />);
    expect(container.textContent).toBe('nope');
    expect(container.querySelector('[data-glossary-term]')).toBeNull();
  });
});

describe('RichText', () => {
  it('turns [[id]] and [[id|label]] markers into glossary terms', () => {
    const { container } = render(
      <RichText text="Select the [[hull]] or the [[hull|lower body]]." locale="en" />,
    );
    const terms = container.querySelectorAll('[data-glossary-term="hull"]');
    expect(terms).toHaveLength(2);
    expect(terms[0].textContent).toBe(hull.term.en);
    expect(terms[1].textContent).toBe('lower body');
    expect(container.textContent).toBe(`Select the ${hull.term.en} or the lower body.`);
  });
});
