import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ExpenseCategory, FinanceEntry, FinanceEntryType } from '../../types';
import { useLanguage } from '../../i18n';
import {
  EXPENSE_CATEGORIES,
  FinanceEntryInput,
  NEW_CATEGORY_VALUE,
  addCustomCategory,
  getCustomCategories,
  todayKey,
} from '../../services/financeService';

const CUSTOM_PREFIX = '__custom__:';

interface FinanceEntryModalProps {
  isOpen: boolean;
  initialType: FinanceEntryType;
  /** Prefills the date field when adding a new entry. */
  initialDate?: string;
  entry?: FinanceEntry | null;
  onClose: () => void;
  onSubmit: (input: FinanceEntryInput) => Promise<void>;
}

export function FinanceEntryModal({
  isOpen,
  initialType,
  initialDate,
  entry,
  onClose,
  onSubmit,
}: FinanceEntryModalProps) {
  const { t } = useLanguage();
  const [type, setType] = useState<FinanceEntryType>(initialType);
  const [date, setDate] = useState(todayKey());
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [note, setNote] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>(() => getCustomCategories());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setError('');
    setSaving(false);
    setCustomCategories(getCustomCategories());

    if (entry) {
      setType(entry.type);
      setDate(entry.date);
      setAmount(String(entry.amount));
      setNote(entry.note ?? '');

      if (entry.type === 'expense') {
        const label = entry.categoryLabel?.trim();
        if (entry.category === 'other' && label) {
          const known = getCustomCategories().includes(label);
          setCategory(known ? `${CUSTOM_PREFIX}${label}` : NEW_CATEGORY_VALUE);
          setCustomCategory(label);
        } else {
          setCategory(entry.category ?? 'other');
          setCustomCategory('');
        }
      } else {
        setCategory(EXPENSE_CATEGORIES[0]);
        setCustomCategory('');
      }
    } else {
      setType(initialType);
      setDate(initialDate || todayKey());
      setAmount('');
      setCategory(EXPENSE_CATEGORIES[0]);
      setCustomCategory('');
      setNote('');
    }
  }, [isOpen, entry, initialType, initialDate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t.finance.invalidAmount);
      return;
    }
    if (!date) {
      setError(t.finance.dateRequired);
      return;
    }

    let finalCategory: ExpenseCategory | undefined;
    let categoryLabel: string | undefined;

    if (type === 'expense') {
      if (category === NEW_CATEGORY_VALUE) {
        const clean = customCategory.trim();
        if (!clean) {
          setError(t.finance.categoryRequired);
          return;
        }
        addCustomCategory(clean);
        setCustomCategories(getCustomCategories());
        finalCategory = 'other';
        categoryLabel = clean;
      } else if (category.startsWith(CUSTOM_PREFIX)) {
        finalCategory = 'other';
        categoryLabel = category.slice(CUSTOM_PREFIX.length);
      } else {
        finalCategory = category as ExpenseCategory;
      }
    }

    setSaving(true);
    try {
      await onSubmit({
        type,
        date,
        amount: parsed,
        category: finalCategory,
        categoryLabel,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.finance.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const title = entry
    ? t.finance.editEntry
    : type === 'income'
      ? t.finance.addIncome
      : t.finance.addExpense;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md" closeOnBackdrop={false}>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType('income')}
            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              type === 'income'
                ? 'border-status-success bg-status-success/15 text-status-success'
                : 'border-border bg-surface text-text-secondary hover:bg-hover'
            }`}
          >
            {t.finance.income}
          </button>
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              type === 'expense'
                ? 'border-status-danger bg-status-danger/15 text-status-danger'
                : 'border-border bg-surface text-text-secondary hover:bg-hover'
            }`}
          >
            {t.finance.expense}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="finance-date" className="block text-sm text-text-secondary mb-1">
              {t.finance.date}
            </label>
            <input
              id="finance-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label htmlFor="finance-amount" className="block text-sm text-text-secondary mb-1">
              {t.finance.amount}
            </label>
            <input
              id="finance-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={t.finance.amountPlaceholder}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>

        {type === 'expense' && (
          <>
            <div>
              <label htmlFor="finance-category" className="block text-sm text-text-secondary mb-1">
                {t.finance.category}
              </label>
              <select
                id="finance-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
              >
                {EXPENSE_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {t.finance.categories[key]}
                  </option>
                ))}
                {customCategories.map((name) => (
                  <option key={name} value={`${CUSTOM_PREFIX}${name}`}>
                    {name}
                  </option>
                ))}
                <option value={NEW_CATEGORY_VALUE}>+ {t.finance.customCategory}</option>
              </select>
            </div>

            {category === NEW_CATEGORY_VALUE && (
              <div>
                <label htmlFor="finance-custom-category" className="block text-sm text-text-secondary mb-1">
                  {t.finance.customCategory}
                </label>
                <input
                  id="finance-custom-category"
                  type="text"
                  maxLength={40}
                  value={customCategory}
                  onChange={(event) => setCustomCategory(event.target.value)}
                  placeholder={t.finance.customCategoryPlaceholder}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
            )}
          </>
        )}

        <div>
          <label htmlFor="finance-note" className="block text-sm text-text-secondary mb-1">
            {t.finance.note}
          </label>
          <textarea
            id="finance-note"
            rows={2}
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.finance.notePlaceholder}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
          />
        </div>

        {error && <p className="text-sm text-status-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t.common.cancel}
          </Button>
          <Button type="submit" isLoading={saving}>
            {t.common.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
