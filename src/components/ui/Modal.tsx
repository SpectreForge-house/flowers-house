import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Form dialogs (client, bouquet, order, ...) pass false: the dark backdrop
   * never closes them, so an accidental click outside the window cannot throw
   * away typed data. Read-only windows (details, confirmations, lightbox)
   * keep the default and still close on a backdrop click.
   */
  closeOnBackdrop?: boolean;
}

const sizeClasses = {
  sm: 'w-full sm:max-w-sm',
  md: 'w-full sm:max-w-lg',
  lg: 'w-full sm:max-w-2xl',
  xl: 'w-full sm:max-w-4xl',
};

// Only the topmost open dialog reacts to Escape, and the body scroll lock is
// reference-counted: closing a nested "Discard changes?" prompt must neither
// close the form behind it nor unlock scrolling while that form is still open.
const openModalIds: number[] = [];
let nextModalId = 0;
let bodyLocks = 0;

export function Modal({ isOpen, onClose, title, children, size = 'md', closeOnBackdrop = true }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const id = ++nextModalId;
    openModalIds.push(id);
    bodyLocks += 1;
    document.body.style.overflow = 'hidden';

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openModalIds[openModalIds.length - 1] !== id) return;
      onClose();
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      openModalIds.splice(openModalIds.indexOf(id), 1);
      bodyLocks -= 1;
      if (bodyLocks <= 0) {
        bodyLocks = 0;
        document.body.style.overflow = 'unset';
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 modal-overlay lg:left-64 z-[55] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === overlayRef.current) onClose();
      }}
    >
      <div className={`${sizeClasses[size]} bg-card sm:rounded-lg border border-border shadow-2xl max-h-[88vh] sm:max-h-[calc(100vh-200px)] overflow-hidden sm:overflow-y-auto rounded-t-2xl`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-hover rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
