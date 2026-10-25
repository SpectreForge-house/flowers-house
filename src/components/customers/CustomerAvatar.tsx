import { useEffect, useState } from 'react';
import { Customer } from '../../types';
import { photoOwnerKey } from '../../services/photoStorage';
import { useOwnerPhotos, usePhotoUrl } from '../../hooks/usePhotoUrl';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

export function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface CustomerAvatarProps {
  customer: Pick<Customer, 'id' | 'name'>;
  size?: AvatarSize;
}

/**
 * Round client photo. Without a photo (or when the file is missing on disk)
 * it falls back to a themed placeholder with the client's initials.
 */
export function CustomerAvatar({ customer, size = 'md' }: CustomerAvatarProps) {
  const photos = useOwnerPhotos(photoOwnerKey('client', customer.id));
  const url = usePhotoUrl(photos[0]);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [url]);

  const dimensions = sizeClasses[size];

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={customer.name}
        onError={() => setBroken(true)}
        className={`${dimensions} rounded-full object-cover border border-border shrink-0 bg-surface`}
      />
    );
  }

  return (
    <div
      className={`${dimensions} rounded-full bg-surface border border-border text-text-secondary flex items-center justify-center font-medium shrink-0 select-none tracking-wide`}
      aria-hidden="true"
    >
      {getInitials(customer.name)}
    </div>
  );
}
