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

  // Načítaj tému pri štarte — pre slug z URL (homepage) alebo z auth session (admin)
  useEffect(() => {
    async function loadTheme() {
      // 1. Skús načítať podľa prihláseného usera (admin)
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
            return;
          }
        }
      }

      // 2. Fallback: načítaj podľa slug z URL (verejná homepage)
      const slug = window.location.pathname.split('/').filter(Boolean)[0];
      const reservedSlugs = ['admin', 'login', 'register', 'dashboard'];
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
      }
    }
    loadTheme();
  }, []);

  async function setTheme(id: ThemeId, bakeryId?: string) {
    applyTheme(id);
    setThemeId(id);

    // Zisti bakery_id ak nebol poskytnutý
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
      // Try UPDATE first; if no row exists yet, INSERT
      const { error: updateErr, count } = await supabase
        .from('app_settings')
        .update({ value: id })
        .eq('bakery_id', resolvedBakeryId)
        .eq('key', 'theme');
      if (!updateErr && count === 0) {
        // Row didn't exist yet — insert it
        await supabase
          .from('app_settings')
          .insert({ bakery_id: resolvedBakeryId, key: 'theme', value: id });
      }
    }
  }

  return (
    <ThemeContext.Provider value={{ themeId, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
