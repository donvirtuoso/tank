import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { dictionaries, LOCALES, type Locale, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useToastStore } from '@/stores/useToastStore';
import { useUiStore } from '@/stores/useUiStore';

export function SettingsDialog() {
  const t = useT();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const close = useUiStore((s) => s.closeSettings);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const changeLocale = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    pushToast({ title: dictionaries[next].settings.languageChanged, variant: 'success' });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-96 rounded-lg border border-gunmetal-700 bg-gunmetal-900 shadow-panel"
      >
        <div className="flex items-center justify-between border-b border-gunmetal-700 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold uppercase tracking-wider">
            {t.settings.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            onClick={close}
            aria-label={t.settings.close}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="p-4">
          <fieldset>
            <legend className="mb-2 text-xs text-gunmetal-400">{t.settings.language}</legend>
            <div className="flex gap-2">
              {LOCALES.map((l) => (
                <label
                  key={l}
                  className={cn(
                    'flex flex-1 cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm',
                    l === locale
                      ? 'border-olive-500 bg-olive-900/40 text-olive-100'
                      : 'border-gunmetal-600 text-gunmetal-300 hover:border-gunmetal-500',
                  )}
                >
                  <input
                    type="radio"
                    name="locale"
                    value={l}
                    checked={l === locale}
                    onChange={() => changeLocale(l)}
                    className="accent-olive-500"
                  />
                  {t.languages[l]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
