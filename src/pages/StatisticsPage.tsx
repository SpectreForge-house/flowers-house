import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, ShoppingCart, TrendingUp, Package } from 'lucide-react';
import { getRevenueStats, getOrderStats, getPopularBouquets, getPopularFlowers, getEstimatedProfit, getDailyRevenue } from '../services/statisticsService';
import { getInventoryValue, getLowStockItems } from '../services/inventoryService';
import { formatCurrency } from '../utils/formatters';
import { useLanguage } from '../i18n';
import { useOrders, useBouquets, useInventory } from '../hooks/useStore';

export function StatisticsPage() {
  const { t } = useLanguage();
  const { orders } = useOrders();
  const { bouquets } = useBouquets();
  const { inventory } = useInventory();
  const revenueStats = getRevenueStats(orders);
  const orderStats = getOrderStats(orders);
  const popularBouquets = getPopularBouquets(orders, bouquets);
  const popularFlowers = getPopularFlowers(orders, bouquets, inventory);
  const profitStats = getEstimatedProfit(orders, bouquets, inventory);
  const inventoryValue = getInventoryValue(inventory);
  const lowStockCount = getLowStockItems(inventory).length;
  const dailyRevenue = getDailyRevenue(14, orders);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">{t.statistics.title}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-success/20 rounded-lg">
              <DollarSign size={24} className="text-status-success" />
            </div>
            <div>
              <p className="text-text-secondary text-sm">{t.statistics.todayRevenue}</p>
              <p className="text-xl font-bold text-text-primary">{formatCurrency(revenueStats.todayRevenue)}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-info/20 rounded-lg">
              <ShoppingCart size={24} className="text-status-info" />
            </div>
            <div>
              <p className="text-text-secondary text-sm">{t.statistics.totalOrders}</p>
              <p className="text-xl font-bold text-text-primary">{orderStats.totalOrders}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-2/20 rounded-lg">
              <TrendingUp size={24} className="text-accent-2-light" />
            </div>
            <div>
              <p className="text-text-secondary text-sm">{t.statistics.avgOrderValue}</p>
              <p className="text-xl font-bold text-text-primary">{formatCurrency(orderStats.avgOrderValue)}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-warning/20 rounded-lg">
              <Package size={24} className="text-status-warning" />
            </div>
            <div>
              <p className="text-text-secondary text-sm">{t.statistics.inventoryValue}</p>
              <p className="text-xl font-bold text-text-primary">{formatCurrency(inventoryValue)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-text-primary font-medium mb-2">{t.statistics.revenueThisWeek}</h3>
          <p className="text-2xl font-bold text-status-success">{formatCurrency(revenueStats.weekRevenue)}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-text-primary font-medium mb-2">{t.statistics.revenueThisMonth}</h3>
          <p className="text-2xl font-bold text-status-success">{formatCurrency(revenueStats.monthRevenue)}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-text-primary font-medium mb-2">{t.statistics.lowStockItems}</h3>
          <p className="text-2xl font-bold text-status-warning">{lowStockCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-text-primary font-medium mb-4">{t.statistics.dailyRevenue}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyRevenue}>
                <XAxis dataKey="date" stroke="var(--chart-axis)" fontSize={12} tickFormatter={(v: string) => v.split(' ')[1] || v} />
                <YAxis stroke="var(--chart-axis)" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                  itemStyle={{ color: 'var(--status-success)' }}
                />
                <Bar dataKey="revenue" name={t.statistics.dailyRevenue} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-text-primary font-medium mb-4">{t.statistics.profitOverview}</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">{t.statistics.totalRevenue}</span>
              <span className="text-text-primary font-medium">{formatCurrency(profitStats.totalRevenue)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">{t.statistics.totalCost}</span>
              <span className="text-status-warning font-medium">{formatCurrency(profitStats.totalCost)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-text-primary font-medium">{t.statistics.estimatedProfit}</span>
              <span className="text-status-success text-xl font-bold">{formatCurrency(profitStats.profit)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">{t.statistics.profitMargin}</span>
              <span className="text-text-primary font-medium">{profitStats.margin.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-text-primary font-medium mb-4">{t.statistics.popularBouquets}</h3>
          {popularBouquets.length === 0 ? (
            <p className="text-text-muted text-center py-4">{t.statistics.noData}</p>
          ) : (
            <div className="space-y-3">
              {popularBouquets.map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                    <span className="text-text-primary font-medium text-sm">{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-text-primary">{item.bouquet?.name}</p>
                    <p className="text-text-muted text-sm">{item.count} {t.statistics.sold}</p>
                  </div>
                  <span className="text-status-success font-medium">
                    {formatCurrency((item.bouquet?.sellingPrice || 0) * item.count)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-text-primary font-medium mb-4">{t.statistics.popularFlowers}</h3>
          {popularFlowers.length === 0 ? (
            <p className="text-text-muted text-center py-4">{t.statistics.noData}</p>
          ) : (
            <div className="space-y-3">
              {popularFlowers.map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                    <span className="text-text-primary font-medium text-sm">{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-text-primary">{item.item?.name}</p>
                    <p className="text-text-muted text-sm">{item.count} {t.statistics.stemsUsed}</p>
                  </div>
                  <span className="text-text-secondary">
                    {item.item?.color && <span className="text-sm">({item.item.color})</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
