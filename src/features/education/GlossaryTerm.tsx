import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { glossary, localize, type Locale } from '../../stores/useEducationStore';

/* Shared glossary tooltip + rich text, used by GuidedLesson and AssemblyTutorial. */

export interface GlossaryTermProps {
  termId: string;
  locale: Locale;
  children?: ReactNode;
}

/** Inline term with a tooltip (hover / keyboard focus) showing its glossary definition. */
export function GlossaryTerm({ termId, locale, children }: GlossaryTermProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const entry = glossary[termId];
  if (!entry) return <>{children ?? termId}</>;

  return (
    <span
      style={styles.term}
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
      data-glossary-term={termId}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children ?? localize(entry.term, locale)}
      {open && (
        <span role="tooltip" id={tooltipId} style={styles.tooltip}>
          <strong>{localize(entry.term, locale)}</strong>
          <br />
          {localize(entry.definition, locale)}
        </span>
      )}
    </span>
  );
}

/**
 * Renders text containing glossary markers: `[[termId]]` (uses the localized
 * glossary label) or `[[termId|custom label]]`.
 */
export function RichText({ text, locale }: { text: string; locale: Locale }) {
  const parts: ReactNode[] = [];
  const pattern = /\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <GlossaryTerm key={`${match[1]}-${match.index}`} termId={match[1]} locale={locale}>
        {match[2]}
      </GlossaryTerm>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const styles: Record<string, CSSProperties> = {
  term: {
    position: 'relative',
    borderBottom: '1px dotted currentColor',
    cursor: 'help',
    fontWeight: 600,
  },
  tooltip: {
    position: 'absolute',
    left: 0,
    bottom: '125%',
    zIndex: 10,
    width: 240,
    padding: 8,
    borderRadius: 6,
    background: '#000',
    color: '#fff',
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.4,
    boxShadow: '0 4px 12px rgba(0,0,0,.4)',
  },
};
