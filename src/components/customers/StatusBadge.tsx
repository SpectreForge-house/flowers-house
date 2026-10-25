import { ClientStatus } from '../../types';
import { useLanguage } from '../../i18n';

const baseClasses = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border';

// Theme-token-only colours: each status gets its own accent pair, all of which
// carry readable text across the light and dark themes (border + tinted bg).
const statusClasses: Record<ClientStatus, string> = {
  new: 'bg-elevated/60 text-text-secondary border-border',
  regular: 'bg-accent-green/20 text-accent-green-light border-accent-green/30',
  vip: 'bg-accent-2/20 text-accent-2-light border-accent-2/30',
};

interface StatusBadgeProps {
  status: ClientStatus;
}

/** Small pill showing a client's automatic status (New / Regular / VIP). */
export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useLanguage();

  return (
    <span className={`${baseClasses} ${statusClasses[status]}`}>
      {t.clientStatus.statuses[status]}
    </span>
  );
}
