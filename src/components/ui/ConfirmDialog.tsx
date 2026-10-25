import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const buttonColors = {
    danger: 'bg-status-danger hover:bg-status-danger/80',
    warning: 'bg-status-warning hover:bg-status-warning/80',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center text-center">
        <div className={`p-3 rounded-full ${variant === 'danger' ? 'bg-status-danger/20' : 'bg-status-warning/20'} mb-4`}>
          <AlertTriangle size={32} className={variant === 'danger' ? 'text-status-danger' : 'text-status-warning'} />
        </div>
        <p className="text-text-secondary mb-6">{message}</p>
        <div className="flex gap-3 w-full">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface hover:bg-elevated text-text-primary rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-2 ${buttonColors[variant]} text-text-primary rounded-lg transition-colors`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
