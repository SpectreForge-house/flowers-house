import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import en from './en';
import ru from './ru';
import bg from './bg';
import { getLanguage, setLanguage as saveLanguage } from '../services/storage';
import { getAuthState, getProfileLanguage, isSupabaseAvailable, onAuthChange, updateProfileLanguage } from '../services/authService';

export type Language = 'en' | 'ru' | 'bg';

const translations = { en, ru, bg };

type TranslationKeys = typeof en;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationKeys;
  tAddress: () => string;
  tMessage: (msg: { key: string; params?: Record<string, string | number> }) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function resolveMessage(t: TranslationKeys, key: string, params?: Record<string, string | number>): string {
  const parts = key.split('.');
  let value: any = t;
  for (const part of parts) {
    value = value?.[part];
  }
  if (typeof value !== 'string') return key;
  if (!params) return value;
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    value
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return getLanguage() as Language;
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguageState(lang);
    saveLanguage(lang);
    if (isSupabaseAvailable() && getAuthState().user) {
      void updateProfileLanguage(lang);
    }
  };

  const t = translations[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!isSupabaseAvailable()) return;
    let cancelled = false;

    const syncFromProfile = async () => {
      if (!getAuthState().user) return;
      const lang = await getProfileLanguage();
      if (cancelled || !lang || !['en', 'ru', 'bg'].includes(lang)) return;
      setLanguageState(current => {
        if (current === lang) return current;
        saveLanguage(lang);
        return lang as Language;
      });
    };

    void syncFromProfile();
    const unsubscribe = onAuthChange(state => {
      if (state.user) void syncFromProfile();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const tAddress = () => {
    return translations.en.shop.address[language];
  };

  const tMessage = (msg: { key: string; params?: Record<string, string | number> }): string => {
    return resolveMessage(t, msg.key, msg.params);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t, tAddress, tMessage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
