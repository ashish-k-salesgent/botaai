import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel?.()}>
      <AlertDialogContent className="modal-shell rounded-none max-w-md p-0 gap-0 border border-[var(--border)]">
        <AlertDialogHeader className="px-5 py-4 border-b border-[var(--border)] text-left space-y-2">
          <div className="label-mono text-[var(--brand-primary)] text-[10px]">Confirm</div>
          <AlertDialogTitle className="font-display font-black text-xl tracking-tight">
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="px-5 py-3 border-t border-[var(--border)] sm:justify-end gap-2">
          <AlertDialogCancel
            disabled={loading}
            className="rounded-none border border-[var(--border)] text-sm font-mono mt-0"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-none disabled:opacity-50 ${
              destructive ? "bg-[var(--brand-destructive)] text-white hover:opacity-90" : "btn-primary"
            }`}
          >
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
