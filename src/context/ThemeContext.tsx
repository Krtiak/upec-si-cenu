import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { themes, type ThemeId } from '../styles/themes';

interface ThemeContextValue {
  themeId: ThemeId;
  setTheme: (id: ThemeId, bakeryId?: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'pink',
  setTheme: async () => {},
});

function applyTheme(id: ThemeId) {
  const theme = themes.find(t => t.id === id) ?? themes[0];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('pink');

  // Načítaj tému pri štarte — podľa slug v URL (verejná stránka) alebo prihláseného admina
  useEffect(() => {
    async function loadTheme() {
      const slug = window.location.pathname.split('/').filter(Boolean)[0];
      const reservedSlugs = ['admin', 'login', 'register', 'dashboard', 'podmienky'];

      // 1. Verejná stránka pekárne — slug v URL
      if (slug && !reservedSlugs.includes(slug)) {
        const { data: bakery } = await supabase
          .from('bakeries')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (bakery?.id) {
          const { data } = await supabase
            .from('app_settings')
            .select('value')
            .eq('bakery_id', bakery.id)
            .eq('key', 'theme')
            .maybeSingle();
          if (data?.value) {
            applyTheme(data.value as ThemeId);
            setThemeId(data.value as ThemeId);
          }
        }
        return;
      }

      // 2. Admin stránka — čítaj tému podľa prihláseného usera
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: member } = await supabase
          .from('bakery_members')
          .select('bakery_id')
          .eq('user_id', session.user.id)
          .single();
        if (member?.bakery_id) {
          const { data } = await supabase
            .from('app_settings')
            .select('value')
            .eq('bakery_id', member.bakery_id)
            .eq('key', 'theme')
            .maybeSingle();
          if (data?.value) {
            applyTheme(data.value as ThemeId);
            setThemeId(data.value as ThemeId);
          }
        }
      }
    }
    loadTheme();
  }, []);

  async function setTheme(id: ThemeId, bakeryId?: string) {
    applyTheme(id);
    setThemeId(id);

    let resolvedBakeryId = bakeryId;
    if (!resolvedBakeryId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: member } = await supabase
          .from('bakery_members')
          .select('bakery_id')
          .eq('user_id', session.user.id)
          .single();
        resolvedBakeryId = member?.bakery_id;
      }
    }

    if (resolvedBakeryId) {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ bakery_id: resolvedBakeryId, key: 'theme', value: id }, { onConflict: 'bakery_id,key' });
      if (error) console.error('setTheme save failed:', error.message);
    }
  }

  return (
    <ThemeContext.Provider value={{ themeId, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
