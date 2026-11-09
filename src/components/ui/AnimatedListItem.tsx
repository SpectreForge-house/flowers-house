import { useState, useEffect, useRef, ReactNode } from 'react';

interface AnimatedListItemProps {
  children: ReactNode;
  isDeleting: boolean;
  onComplete?: () => void;
  variant?: 'slide-up' | 'slide-left';
  animateOnMount?: boolean;
}

export function AnimatedListItem({
  children,
  isDeleting,
  onComplete,
  variant = 'slide-up',
  animateOnMount = false,
}: AnimatedListItemProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [isEntering, setIsEntering] = useState(animateOnMount);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animateOnMount) return;
    setIsEntering(true);
    const timer = setTimeout(() => setIsEntering(false), 300);
    return () => clearTimeout(timer);
  }, [animateOnMount]);

  useEffect(() => {
    if (isDeleting) {
      setShouldAnimate(true);
      const timer = setTimeout(() => {
        onComplete?.();
      }, 350);
      return () => clearTimeout(timer);
    }
    setShouldAnimate(false);
  }, [isDeleting, onComplete]);

  const deleteClass = variant === 'slide-up' ? 'animate-delete' : 'animate-delete-row';
  const className = shouldAnimate ? deleteClass : isEntering ? 'animate-add' : '';

  return (
    <div
      ref={ref}
      className={className}
    >
      {children}
    </div>
  );
}
