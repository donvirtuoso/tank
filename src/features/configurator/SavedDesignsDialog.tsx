import { FolderOpen, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Locale, SavedDesign } from '@/domain/models/types';
import {
  captureThumbnailAfterFrame,
  downloadDesign,
  readDesignFile,
  MAX_IMPORT_BYTES,
  type ImportError,
  type ImportWarning,
} from '@/services/importExport';
import {
  installStorageSync,
  installUnsavedChangesGuard,
  selectCurrentDesign,
  useSavedDesignsStore,
} from '@/stores/useSavedDesignsStore';
import { useToastStore } from '@/stores/useToastStore';
import { useUiStore } from '@/stores/useUiStore';
import { useVehicleStore } from '@/stores/useVehicleStore';

const COPY = {
  vi: {
    title: 'Thiết kế đã lưu',
    close: 'Đóng',
    current: 'Thiết kế hiện tại',
    unsavedTitle: 'Chưa có tên (chưa lưu)',
    name: 'Tên thiết kế',
    save: 'Lưu',
    saveAs: 'Lưu thành bản mới',
    dirty: 'Có thay đổi chưa lưu',
    clean: 'Đã lưu',
    newDesign: 'Thiết kế mới',
    import: 'Nhập JSON',
    reset: 'Đặt lại',
    empty: 'Chưa có thiết kế nào được lưu.',
    open: 'Mở',
    rename: 'Đổi tên',
    duplicate: 'Nhân bản',
    export: 'Xuất JSON',
    delete: 'Xoá',
    apply: 'Áp dụng',
    cancel: 'Huỷ',
    confirm: 'Xác nhận',
    opened: 'Đang mở',
    updated: 'Cập nhật',
    saved: 'Đã lưu thiết kế',
    imported: 'Đã nhập thiết kế',
    importFailed: 'Không thể nhập tệp JSON',
    importWarnings: 'Cảnh báo khi nhập',
    importErrors: 'Lỗi khi nhập',
    root: '(toàn bộ tệp)',
    discardTitle: 'Thay đổi chưa lưu',
    discardSwitch: 'Thiết kế hiện tại có thay đổi chưa lưu. Chuyển thiết kế sẽ bỏ các thay đổi này.',
    resetConfirm: 'Đặt lại về cấu hình mặc định? Mọi thay đổi chưa lưu và lịch sử hoàn tác sẽ bị xoá.',
    deleteConfirm: (name: string) => `Xoá vĩnh viễn thiết kế "${name}"?`,
    discard: 'Bỏ thay đổi',
    sizeHint: `Tối đa ${Math.floor(MAX_IMPORT_BYTES / 1024)} KB`,
  },
  en: {
    title: 'Saved designs',
    close: 'Close',
    current: 'Current design',
    unsavedTitle: 'Untitled (not saved)',
    name: 'Design name',
    save: 'Save',
    saveAs: 'Save as new',
    dirty: 'Unsaved changes',
    clean: 'Saved',
    newDesign: 'New design',
    import: 'Import JSON',
    reset: 'Reset',
    empty: 'No saved designs yet.',
    open: 'Open',
    rename: 'Rename',
    duplicate: 'Duplicate',
    export: 'Export JSON',
    delete: 'Delete',
    apply: 'Apply',
    cancel: 'Cancel',
    confirm: 'Confirm',
    opened: 'Open',
    updated: 'Updated',
    saved: 'Design saved',
    imported: 'Design imported',
    importFailed: 'Could not import JSON file',
    importWarnings: 'Import warnings',
    importErrors: 'Import errors',
    root: '(whole file)',
    discardTitle: 'Unsaved changes',
    discardSwitch: 'The current design has unsaved changes. Switching will discard them.',
    resetConfirm: 'Reset to the default configuration? Unsaved changes and undo history will be lost.',
    deleteConfirm: (name: string) => `Permanently delete "${name}"?`,
    discard: 'Discard changes',
    sizeHint: `Max ${Math.floor(MAX_IMPORT_BYTES / 1024)} KB`,
  },
} as const;

interface PendingConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  action: () => void;
}

const formatDate = (iso: string, locale: Locale) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB');
};

/**
 * Thuộc tính đánh dấu vùng chứa canvas 3D dùng để chụp thumbnail (đặt trên khung nhìn 3D).
 * Không lấy `<canvas>` bất kỳ để tránh chụp nhầm biểu đồ / minimap.
 */
export const THUMBNAIL_CANVAS_ATTR = 'data-design-thumbnail';

export const findThumbnailCanvas = (root: ParentNode | undefined = globalThis.document): HTMLCanvasElement | null =>
  root?.querySelector<HTMLCanvasElement>(`canvas[${THUMBNAIL_CANVAS_ATTR}], [${THUMBNAIL_CANVAS_ATTR}] canvas`) ?? null;

/** Gắn cảnh báo `beforeunload` khi có thay đổi chưa lưu. Đặt một lần ở cấp App. */
export function UnsavedChangesGuard() {
  useEffect(() => installUnsavedChangesGuard(), []);
  return null;
}

/**
 * Đồng bộ phiên làm việc ở cấp App: khi khởi động nạp lại thiết kế đang mở ở lần trước,
 * và tự làm mới danh sách khi tab khác thay đổi LocalStorage.
 */
export function SavedDesignsSync() {
  useEffect(() => {
    useSavedDesignsStore.getState().restoreCurrent();
    return installStorageSync();
  }, []);
  return null;
}

const BUTTON_COPY = {
  vi: { label: 'Lưu / mở thiết kế', dirty: 'có thay đổi chưa lưu' },
  en: { label: 'Save / open designs', dirty: 'unsaved changes' },
} as const;

/** Nút mở {@link SavedDesignsDialog} (đặt trên thanh công cụ); hiện chấm khi có thay đổi chưa lưu. */
export function SavedDesignsButton({ className = 'tool-btn' }: { className?: string }) {
  const locale = useUiStore((s) => s.locale);
  const dirty = useVehicleStore((s) => s.dirty);
  const [open, setOpen] = useState(false);
  const onClose = useCallback(() => setOpen(false), []);
  const t = BUTTON_COPY[locale];
  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={dirty ? `${t.label} (${t.dirty})` : t.label}
        onClick={() => setOpen(true)}
      >
        <FolderOpen className="h-3.5 w-3.5" aria-hidden />
        {t.label}
        {dirty && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300" />}
      </button>
      {open && createPortal(<SavedDesignsDialog onClose={onClose} />, document.body)}
    </>
  );
}

export interface SavedDesignsDialogProps {
  onClose: () => void;
  /** Canvas 3D để chụp thumbnail; mặc định {@link findThumbnailCanvas}. */
  getCanvas?: () => HTMLCanvasElement | null;
}

/**
 * Hộp thoại quản lý thiết kế: lưu / lưu thành bản mới, tạo mới, mở, đổi tên, nhân bản, xoá,
 * xuất / nhập JSON (kiểm tra Zod, hiển thị lỗi theo path, cảnh báo khi thay biến thể) và
 * đặt lại có xác nhận. Cảnh báo trước khi chuyển thiết kế nếu còn thay đổi chưa lưu.
 */
export function SavedDesignsDialog({ onClose, getCanvas = findThumbnailCanvas }: SavedDesignsDialogProps) {
  const locale = useUiStore((s) => s.locale);
  const t = COPY[locale];
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const designs = useSavedDesignsStore((s) => s.designs);
  const currentId = useSavedDesignsStore((s) => s.currentId);
  const current = useSavedDesignsStore(selectCurrentDesign);
  const storeError = useSavedDesignsStore((s) => s.error);
  const actions = useSavedDesignsStore.getState;
  const dirty = useVehicleStore((s) => s.dirty);
  const catalog = useVehicleStore((s) => s.catalog);
  const resetVehicle = useVehicleStore((s) => s.reset);
  const pushToast = useToastStore((s) => s.push);

  const [name, setName] = useState(current?.name ?? '');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>([]);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  useEffect(() => setName(current?.name ?? ''), [current?.id, current?.name]);

  useEffect(() => {
    actions().refresh();
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape đóng hộp xác nhận trước, rồi mới đến hộp thoại chính.
      if (pendingRef.current) setPending(null);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    // Cảnh báo `beforeunload` do <UnsavedChangesGuard /> ở cấp App đảm nhiệm.
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, onClose]);

  /** Chạy `action` ngay nếu không có thay đổi chưa lưu; ngược lại hỏi xác nhận trước. */
  const guardSwitch = (action: () => void) => {
    if (!useVehicleStore.getState().dirty) {
      action();
      return;
    }
    setPending({ title: t.discardTitle, message: t.discardSwitch, confirmLabel: t.discard, action });
  };

  const captureThumbnail = async (): Promise<string | undefined> => {
    const canvas = getCanvas();
    return canvas ? captureThumbnailAfterFrame(canvas) : undefined;
  };

  const notifySaved = (saved: SavedDesign | null) => {
    if (saved) pushToast({ title: t.saved, description: saved.name, variant: 'success' });
  };

  const onSave = async (asNew: boolean) => {
    setBusy(true);
    try {
      const thumbnailDataUrl = await captureThumbnail();
      const saved = asNew
        ? actions().saveAs(name || t.newDesign, thumbnailDataUrl)
        : actions().saveCurrent({ ...(name && { name }), thumbnailDataUrl });
      notifySaved(saved);
    } finally {
      setBusy(false);
    }
  };

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportErrors([]);
    setImportWarnings([]);
    const result = await readDesignFile(file, { catalog });
    if (!result.ok) {
      setImportErrors(result.errors);
      pushToast({ title: t.importFailed, description: result.errors[0]?.message, variant: 'error' });
      return;
    }
    setImportWarnings(result.warnings);
    const saved = actions().importDesign(result.design);
    if (saved) {
      pushToast({
        title: t.imported,
        description: saved.name,
        variant: result.warnings.length > 0 ? 'warning' : 'success',
      });
    }
  };

  const commitRename = (id: string) => {
    if (actions().rename(id, renameValue)) setRenamingId(null);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-[32rem] flex-col rounded-lg border border-gunmetal-700 bg-gunmetal-900 shadow-panel"
      >
        <div className="flex items-center justify-between border-b border-gunmetal-700 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold uppercase tracking-wider">
            {t.title}
          </h2>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label={t.close}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-4 text-sm">
          <section aria-label={t.current} className="rounded border border-gunmetal-700 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-gunmetal-400">{current ? t.current : t.unsavedTitle}</span>
              <span data-testid="saved-dirty-indicator" className={dirty ? 'text-amber-300' : 'text-gunmetal-400'}>
                {dirty ? t.dirty : t.clean}
              </span>
            </div>
            <label className="flex flex-col gap-1 text-xs">
              {t.name}
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                className="rounded border border-gunmetal-600 bg-gunmetal-800 px-2 py-1 text-sm"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void onSave(false)}>
                {t.save}
              </button>
              <button type="button" disabled={busy} onClick={() => void onSave(true)}>
                {t.saveAs}
              </button>
            </div>
          </section>

          <div role="toolbar" aria-label={t.title} className="flex flex-wrap gap-2">
            <button type="button" onClick={() => guardSwitch(() => actions().createNew(t.newDesign))}>
              {t.newDesign}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} title={t.sizeHint}>
              {t.import}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              data-testid="import-input"
              aria-label={t.import}
              onChange={(e) => void onImportFile(e)}
            />
            <button
              type="button"
              onClick={() =>
                setPending({ title: t.reset, message: t.resetConfirm, confirmLabel: t.reset, action: resetVehicle })
              }
            >
              {t.reset}
            </button>
          </div>

          {storeError && (
            <div role="alert" className="rounded border border-red-500/60 bg-red-950/40 p-2 text-xs">
              {storeError}
              <button type="button" className="ml-2 underline" onClick={() => actions().clearError()}>
                {t.close}
              </button>
            </div>
          )}

          {importErrors.length > 0 && (
            <div role="alert" aria-label={t.importErrors} className="rounded border border-red-500/60 bg-red-950/40 p-2 text-xs">
              <p className="font-semibold">{t.importErrors}</p>
              <ul className="mt-1 list-disc pl-4" data-testid="import-errors">
                {importErrors.map((err, i) => (
                  <li key={`${err.path}-${i}`}>
                    <code>{err.path || t.root}</code>: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importWarnings.length > 0 && (
            <div role="status" aria-label={t.importWarnings} className="rounded border border-amber-500/60 bg-amber-950/30 p-2 text-xs">
              <p className="font-semibold">{t.importWarnings}</p>
              <ul className="mt-1 list-disc pl-4" data-testid="import-warnings">
                {importWarnings.map((w, i) => (
                  <li key={`${w.path}-${i}`}>
                    <code>{w.path}</code>: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {designs.length === 0 ? (
            <p className="text-xs text-gunmetal-400">{t.empty}</p>
          ) : (
            <ul aria-label={t.title} className="flex flex-col gap-2">
              {designs.map((d) => (
                <li
                  key={d.id}
                  data-testid={`design-${d.id}`}
                  aria-current={d.id === currentId || undefined}
                  className="flex gap-2 rounded border border-gunmetal-700 p-2"
                >
                  {d.thumbnailDataUrl ? (
                    <img src={d.thumbnailDataUrl} alt="" className="h-12 w-16 rounded object-cover" />
                  ) : (
                    <div aria-hidden className="h-12 w-16 rounded bg-gunmetal-800" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {renamingId === d.id ? (
                      <form
                        className="flex gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitRename(d.id);
                        }}
                      >
                        <input
                          autoFocus
                          aria-label={t.name}
                          value={renameValue}
                          maxLength={80}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="min-w-0 flex-1 rounded border border-gunmetal-600 bg-gunmetal-800 px-1 text-xs"
                        />
                        <button type="submit" className="text-xs">
                          {t.apply}
                        </button>
                        <button type="button" className="text-xs" onClick={() => setRenamingId(null)}>
                          {t.cancel}
                        </button>
                      </form>
                    ) : (
                      <p className="truncate font-medium" data-testid="design-name">
                        {d.name}
                        {d.id === currentId && <span className="ml-1 text-xs text-olive-300">({t.opened})</span>}
                      </p>
                    )}
                    <p className="text-[11px] text-gunmetal-400">
                      {t.updated}: {formatDate(d.updatedAt, locale)}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        aria-label={`${t.open}: ${d.name}`}
                        onClick={() => guardSwitch(() => actions().load(d.id))}
                      >
                        {t.open}
                      </button>
                      <button
                        type="button"
                        aria-label={`${t.rename}: ${d.name}`}
                        onClick={() => {
                          setRenamingId(d.id);
                          setRenameValue(d.name);
                        }}
                      >
                        {t.rename}
                      </button>
                      <button
                        type="button"
                        aria-label={`${t.duplicate}: ${d.name}`}
                        onClick={() => actions().duplicate(d.id)}
                      >
                        {t.duplicate}
                      </button>
                      <button type="button" aria-label={`${t.export}: ${d.name}`} onClick={() => downloadDesign(d)}>
                        {t.export}
                      </button>
                      <button
                        type="button"
                        aria-label={`${t.delete}: ${d.name}`}
                        onClick={() =>
                          setPending({
                            title: t.delete,
                            message: t.deleteConfirm(d.name),
                            confirmLabel: t.delete,
                            action: () => actions().remove(d.id),
                          })
                        }
                      >
                        {t.delete}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          {...pending}
          cancelLabel={t.cancel}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            pending.action();
          }}
        />
      )}
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-80 rounded-lg border border-gunmetal-600 bg-gunmetal-900 p-4 text-sm shadow-panel"
      >
        <h3 id={titleId} className="mb-2 font-semibold">
          {title}
        </h3>
        <p id={messageId} className="mb-4 text-xs text-gunmetal-300">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="text-red-300">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SavedDesignsDialog;
