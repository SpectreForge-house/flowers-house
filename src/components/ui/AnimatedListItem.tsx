import { useState, useEffect, useRef, ReactNode } from 'react';

interface AnimatedListItemProps {
  children: ReactNode;
  isDeleting: boolean;
  onComplete?: () => void;
  variant?: 'slide-up' | 'slide-left';
}

export function AnimatedListItem({ children, isDeleting, onComplete, variant = 'slide-up' }: AnimatedListItemProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDeleting) {
      setShouldAnimate(true);
      const timer = setTimeout(() => {
        onComplete?.();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isDeleting, onComplete]);

  const className = variant === 'slide-up' ? 'animate-delete' : 'animate-delete-row';

  return (
    <div
      ref={ref}
      className={shouldAnimate ? className : ''}
    >
      {children}
    </div>
  );
}
