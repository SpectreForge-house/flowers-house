import { format, startOfDay, startOfWeek, startOfMonth, subDays } from 'date-fns';
import { getOrders, getInventory, getBouquets } from './storage';
import { calculateBouquetCost } from './inventoryService';
import { Order, Bouquet, InventoryItem } from '../types';

export function getRevenueStats(ordersOverride?: Order[]) {
  const orders = (ordersOverride ?? getOrders()).filter(o => o.status !== 'cancelled');
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const todayRevenue = orders
    .filter(o => new Date(o.createdAt) >= today)
    .reduce((sum, o) => sum + o.total, 0);

  const weekRevenue = orders
    .filter(o => new Date(o.createdAt) >= weekStart)
    .reduce((sum, o) => sum + o.total, 0);

  const monthRevenue = orders
    .filter(o => new Date(o.createdAt) >= monthStart)
    .reduce((sum, o) => sum + o.total, 0);

  return { todayRevenue, weekRevenue, monthRevenue };
}

export function getOrderStats(ordersOverride?: Order[]) {
  const orders = ordersOverride ?? getOrders();
  const completedOrders = orders.filter(o => o.status === 'completed');
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
  const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

  return {
    totalOrders: orders.length,
    completedOrders: completedOrders.length,
    totalRevenue,
    avgOrderValue,
  };
}

export function getPopularBouquets(ordersOverride?: Order[], bouquetsOverride?: Bouquet[]) {
  const orders = (ordersOverride ?? getOrders()).filter(o => o.status !== 'cancelled');
  const bouquets = bouquetsOverride ?? getBouquets();
  
  const bouquetCounts: Record<string, number> = {};
  
  orders.forEach(order => {
    order.items.forEach(item => {
      bouquetCounts[item.bouquetId] = (bouquetCounts[item.bouquetId] || 0) + item.quantity;
    });
  });

  return Object.entries(bouquetCounts)
    .map(([id, count]) => {
      const bouquet = bouquets.find(b => b.id === id);
      return { bouquet, count };
    })
    .filter(item => item.bouquet)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export function getPopularFlowers(ordersOverride?: Order[], bouquetsOverride?: Bouquet[], inventoryOverride?: InventoryItem[]) {
  const orders = (ordersOverride ?? getOrders()).filter(o => o.status !== 'cancelled');
  const bouquets = bouquetsOverride ?? getBouquets();
  const inventory = inventoryOverride ?? getInventory();
  
  const flowerCounts: Record<string, number> = {};
  
  orders.forEach(order => {
    order.items.forEach(orderItem => {
      const bouquet = bouquets.find(b => b.id === orderItem.bouquetId);
      if (bouquet) {
        bouquet.items.forEach(bouquetItem => {
          const key = bouquetItem.inventoryItemId;
          flowerCounts[key] = (flowerCounts[key] || 0) + (bouquetItem.quantity * orderItem.quantity);
        });
      }
    });
  });

  return Object.entries(flowerCounts)
    .map(([id, count]) => {
      const item = inventory.find(i => i.id === id);
      return { item, count };
    })
    .filter(item => item.item)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export function getEstimatedProfit(ordersOverride?: Order[], bouquetsOverride?: Bouquet[], inventoryOverride?: InventoryItem[]) {
  const orders = (ordersOverride ?? getOrders()).filter(o => o.status === 'completed');
  const bouquets = bouquetsOverride ?? getBouquets();
  
  let totalCost = 0;
  let totalRevenue = 0;

  orders.forEach(order => {
    totalRevenue += order.total;
    order.items.forEach(orderItem => {
      const bouquet = bouquets.find(b => b.id === orderItem.bouquetId);
      if (bouquet) {
        const cost = calculateBouquetCost(bouquet, inventoryOverride);
        totalCost += cost * orderItem.quantity;
      }
    });
  });

  return {
    totalRevenue,
    totalCost,
    profit: totalRevenue - totalCost,
    margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
  };
}

export function getDailyRevenue(days: number = 7, ordersOverride?: Order[]): { date: string; revenue: number }[] {
  const orders = (ordersOverride ?? getOrders()).filter(o => o.status !== 'cancelled');
  const result: { date: string; revenue: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayLabel = format(date, 'MMM dd');
    
    const dayRevenue = orders
      .filter(o => o.createdAt.startsWith(dateStr))
      .reduce((sum, o) => sum + o.total, 0);

    result.push({ date: dayLabel, revenue: dayRevenue });
  }

  return result;
}

export function getMonthlyRevenue(ordersOverride?: Order[]): { month: string; revenue: number }[] {
  const orders = (ordersOverride ?? getOrders()).filter(o => o.status !== 'cancelled');
  const result: { month: string; revenue: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const date = subDays(new Date(), i * 30);
    const monthStr = format(date, 'yyyy-MM');
    const monthLabel = format(date, 'MMM yyyy');
    
    const monthRevenue = orders
      .filter(o => o.createdAt.startsWith(monthStr))
      .reduce((sum, o) => sum + o.total, 0);

    result.push({ month: monthLabel, revenue: monthRevenue });
  }

  return result;
}
