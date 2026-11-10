import { useMemo } from 'react';
import { Calculator } from 'lucide-react';
import { useInventory } from '../hooks/useStore';
import { formatCurrency } from '../utils/formatters';
import { useLanguage } from '../i18n';

export function InventoryCalculatorPage() {
  const { t } = useLanguage();
  const { inventory, reservations } = useInventory();

  const categoryLabelMap: Record<string, string> = {
    flowers: t.categories.flowers,
    greenery: t.categories.greenery,
    fillers: t.categories.fillers,
    packaging: t.categories.packaging,
    basketsContainers: t.categories.basketsContainers,
    floralSupplies: t.categories.floralSupplies,
    decorations: t.categories.decorations,
    other: t.categories.other,
  };

  const getCategoryLabel = (cat: string) => categoryLabelMap[cat] || cat;

  const rows = useMemo(() => {
    return inventory.map((item) => {
      const reserved = reservations.filter(r => r.inventoryItemId === item.id && r.status === 'active').reduce((sum, r) => sum + r.quantity, 0);
      const available = item.quantity - reserved;
      const hasPrice = item.purchasePrice != null && item.purchasePrice > 0;
      const value = hasPrice ? available * item.purchasePrice : 0;
      return {
        ...item,
        available,
        hasPrice,
        value,
      };
    });
  }, [inventory, reservations]);

  const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
  const itemsWithoutPrice = rows.filter(r => !r.hasPrice && r.available > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calculator size={28} className="text-accent-green-light" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t.calculator.title}</h1>
          <p className="text-text-muted text-sm">{t.calculator.subtitle}</p>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-6">
        <p className="text-text-secondary text-sm mb-1">{t.calculator.totalValue}</p>
        <p className="text-3xl font-bold text-status-success">{formatCurrency(totalValue)}</p>
        {itemsWithoutPrice > 0 && (
          <p className="text-status-warning text-xs mt-2">
            {itemsWithoutPrice} {itemsWithoutPrice === 1 ? 'item' : 'items'} {t.calculator.missingPrice.toLowerCase()}
          </p>
        )}
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <Calculator size={48} className="mx-auto mb-3 opacity-30" />
            <p>{t.calculator.noItems}</p>
          </div>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.calculator.product}</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.calculator.category}</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.calculator.quantity}</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.calculator.purchasePrice}</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.calculator.totalValueCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-surface">
                      <td className="px-4 py-3">
                        <span className="text-text-primary font-medium">{row.name}</span>
                        {row.color && (
                          <span className="ml-2 text-text-muted text-sm">({row.color})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{getCategoryLabel(row.category)}</td>
                      <td className="px-4 py-3">
                        <span className="text-text-primary">
                          {row.available}
                        </span>
                        <span className="text-text-muted text-sm ml-1">{row.unit}</span>
                      </td>
                      <td className="px-4 py-3">
                        {row.hasPrice ? (
                          <span className="text-text-primary">{formatCurrency(row.purchasePrice)}</span>
                        ) : (
                          <span className="text-status-warning text-sm">{t.calculator.missingPrice}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.hasPrice ? (
                          <span className="text-status-success font-medium">{formatCurrency(row.value)}</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden divide-y divide-[#2a2a2a]">
              {rows.map((row) => (
                <div key={row.id} className="p-4 hover:bg-surface">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-text-primary font-medium">{row.name}</span>
                      {row.color && <span className="ml-2 text-text-muted text-sm">({row.color})</span>}
                    </div>
                    {row.hasPrice ? (
                      <span className="text-status-success font-medium">{formatCurrency(row.value)}</span>
                    ) : (
                      <span className="text-status-warning text-sm">{t.calculator.missingPrice}</span>
                    )}
                  </div>
                  <p className="text-text-muted text-sm mb-1">{getCategoryLabel(row.category)}</p>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-text-secondary">
                      {t.calculator.quantity}: <span className="text-text-primary">{row.available} {row.unit}</span>
                    </span>
                    {row.hasPrice && (
                      <span className="text-text-secondary">
                        {t.calculator.purchasePrice}: <span className="text-text-primary">{formatCurrency(row.purchasePrice)}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border px-4 py-3 flex items-center justify-between">
              <span className="text-text-secondary font-medium">TOTAL</span>
              <span className="text-status-success text-xl font-bold">{formatCurrency(totalValue)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
