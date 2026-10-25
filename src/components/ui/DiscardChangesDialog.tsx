import { ConfirmDialog } from './ConfirmDialog';
import { useLanguage } from '../../i18n';

/**
 * "Discard changes?" prompt shared by every form dialog: shown by
 * `useCloseGuard` right before a form with unsaved edits would be closed.
 */
export function DiscardChangesDialog({ isOpen, onCancel, onConfirm }: {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onCancel}
      onConfirm={onConfirm}
      title={t.common.discardTitle}
      message={t.common.discardMessage}
      confirmLabel={t.common.discard}
      cancelLabel={t.common.keepEditing}
    />
  );
}
