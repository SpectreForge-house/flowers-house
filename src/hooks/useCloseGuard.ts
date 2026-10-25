import { useCallback, useState } from 'react';

interface CloseGuardOptions {
  /** True while the form differs from the values it was opened with. */
  isDirty: boolean;
  /** Actually closes the dialog (hides it / clears the page state). */
  onClose: () => void;
  /** Extra cleanup when the user confirms losing the edits (e.g. drop a draft). */
  onDiscard?: () => void;
}

/**
 * Shared close logic for form dialogs. The X button, Escape and Cancel all go
 * through `requestClose`: a form without changes closes immediately, a form
 * with unsaved edits first asks "Discard changes?" - so an accidental click
 * never throws typed data away.
 */
export function useCloseGuard({ isDirty, onClose, onDiscard }: CloseGuardOptions) {
  const [confirming, setConfirming] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) setConfirming(true);
    else onClose();
  }, [isDirty, onClose]);

  const cancelDiscard = useCallback(() => setConfirming(false), []);

  const confirmDiscard = useCallback(() => {
    setConfirming(false);
    onDiscard?.();
    onClose();
  }, [onDiscard, onClose]);

  return { requestClose, confirming, cancelDiscard, confirmDiscard };
}
