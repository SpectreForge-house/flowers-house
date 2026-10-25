import { useEffect, useState, useRef, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

const MAX_VISIBLE = 4;
const TOAST_DURATION = 4000;
const EXIT_ANIMATION_MS = 400;

let toastListeners: ((toast: Toast) => void)[] = [];
let toastQueue: Toast[] = [];

export function showToast(type: ToastType, message: string) {
  const toast: Toast = {
    id: Math.random().toString(36).substring(7),
    type,
    message,
  };
  toastListeners.forEach(listener => listener(toast));
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const removedRef = useRef(false);
  const onRemoveRef = useRef(onRemove);

  // Keep the ref current so handleClose always calls the latest onRemove
  // without being a dependency that resets the timer.
  useEffect(() => {
    onRemoveRef.current = onRemove;
  }, [onRemove]);

  const handleClose = useCallback(() => {
    if (removedRef.current) return;
    removedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsClosing(true);
    setTimeout(() => {
      onRemoveRef.current();
    }, EXIT_ANIMATION_MS);
  }, []);

  useEffect(() => {
    timerRef.current = setTimeout(handleClose, TOAST_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleClose]);

  const icons = {
    success: <CheckCircle size={20} className="text-status-success" />,
    error: <AlertCircle size={20} className="text-status-danger" />,
    warning: <AlertTriangle size={20} className="text-status-warning" />,
    info: <Info size={20} className="text-status-info" />,
  };

  const bgColors = {
    success: 'border-status-success/30 bg-status-success/10',
    error: 'border-status-danger/30 bg-status-danger/10',
    warning: 'border-status-warning/30 bg-status-warning/10',
    info: 'border-status-info/30 bg-status-info/10',
  };

  return (
    <div
      className={`flex items-start gap-2 p-2.5 sm:p-3 rounded-lg border ${bgColors[toast.type]} shadow-lg`}
      style={{
        opacity: isClosing ? 0 : 1,
        transform: isClosing ? 'translateX(100px)' : 'translateX(0)',
        transition: `opacity ${EXIT_ANIMATION_MS}ms ease-in, transform ${EXIT_ANIMATION_MS}ms ease-in`,
      }}
    >
      <span className="mt-0.5 shrink-0">{icons[toast.type]}</span>
      <span className="text-text-primary text-xs sm:text-sm flex-1 break-words">{toast.message}</span>
      <button
        onClick={handleClose}
        className="text-text-secondary hover:text-text-primary transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [visibleToasts, setVisibleToasts] = useState<Toast[]>([]);

  const processQueue = useCallback(() => {
    if (toastQueue.length > 0 && visibleToasts.length < MAX_VISIBLE) {
      const next = toastQueue.shift()!;
      setVisibleToasts(prev => [...prev, next]);
    }
  }, [visibleToasts.length]);

  // Process queue whenever visible count changes
  useEffect(() => {
    processQueue();
  }, [processQueue]);

  useEffect(() => {
    const listener = (toast: Toast) => {
      setVisibleToasts(prev => {
        if (prev.length < MAX_VISIBLE) {
          return [...prev, toast];
        }
        // Queue overflow toasts
        toastQueue.push(toast);
        return prev;
      });
    };
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    setVisibleToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (visibleToasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 sm:max-w-sm">
      {visibleToasts.map(toast => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
