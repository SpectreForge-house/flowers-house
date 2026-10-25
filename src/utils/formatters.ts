import { OrderStatus } from '../types';

export function formatCurrency(amount: number, symbol: string = '\u20AC'): string {
  return `${symbol}${amount.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('bg-BG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTime(timeStr: string): string {
  return timeStr;
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('bg-BG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status: OrderStatus): string {
  const colors: Record<OrderStatus, string> = {
    new: 'bg-status-info/20 text-status-info',
    confirmed: 'bg-status-warning/20 text-status-warning',
    preparing: 'bg-orange-500/20 text-orange-400',
    ready: 'bg-accent/20 text-accent-light',
    out_for_delivery: 'bg-purple-500/20 text-purple-400',
    completed: 'bg-status-success/20 text-status-success',
    cancelled: 'bg-status-danger/20 text-status-danger',
  };
  return colors[status];
}

export function getStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    new: 'New',
    confirmed: 'Confirmed',
    preparing: 'Preparing',
    ready: 'Ready',
    out_for_delivery: 'Out for Delivery',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status];
}

export function getDeliveryStatusColor(status: string): string {
  const colors: Record<string, string> = {
    waiting: 'bg-status-warning/20 text-status-warning',
    ready: 'bg-accent/20 text-accent-light',
    out_for_delivery: 'bg-purple-500/20 text-purple-400',
    delivered: 'bg-status-success/20 text-status-success',
  };
  return colors[status] || 'bg-status-neutral/20 text-text-secondary';
}

export function getDeliveryStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    waiting: 'Waiting',
    ready: 'Ready',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
  };
  return labels[status] || status;
}

export function getNextStatus(currentStatus: OrderStatus): OrderStatus | null {
  const flow: Record<OrderStatus, OrderStatus | null> = {
    new: 'confirmed',
    confirmed: 'preparing',
    preparing: 'ready',
    ready: 'out_for_delivery',
    out_for_delivery: 'completed',
    completed: null,
    cancelled: null,
  };
  return flow[currentStatus];
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
