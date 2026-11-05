import { useApp } from '../app/AppContext';
import type { WidgetSnapshot } from '../domain/types';

export type BadgeStatus = WidgetSnapshot['status'] | 'rescue' | 'late';

export function StatusBadge({ status, label }: { status: BadgeStatus; label?: string }) {
  const { t } = useApp();
  const text = label ?? (status in t.status ? t.status[status as keyof typeof t.status] : status);
  return <span className={`badge badge-${status}`}>{text}</span>;
}
