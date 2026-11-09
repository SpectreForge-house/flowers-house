import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../../i18n';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  required,
  disabled,
}: PasswordInputProps) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const label = visible ? t.auth.hidePassword : t.auth.showPassword;

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        disabled={disabled}
        className="w-full px-3 py-2 pr-10 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => setVisible(current => !current)}
        title={label}
        aria-label={label}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-primary transition-colors"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
