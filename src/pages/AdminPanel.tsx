import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { themes, type ThemeId } from '../styles/themes';
import { SuperAdminPanel } from './SuperAdminPanel';

// Add styles for number input spinners
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    appearance: textfield;
  }
  
  select option {
    background-color: white !important;
    color: #333 !important;
    padding: 0.5rem;
    font-weight: 500;
  }
  
  select option:hover {
    background-color: #e8f5e9 !important;
    background: #e8f5e9 !important;
    color: #333 !important;
  }
  
  select option:checked {
    background-color: #a5d6a7 !important;
    background: #a5d6a7 !important;
    color: #333 !important;
    font-weight: 600;
  }
  .upec-section-placeholder {
    background: rgba(255,255,255,0.96);
    border: 2px dashed #f79ec5;
    border-radius: 8px;
    box-sizing: border-box;
    transition: background 120ms ease, border-color 120ms ease;
    min-height: 36px;
    display: block;
  }
  .upec-section-drag-clone {
    background: white !important;
    border-radius: 8px;
    overflow: hidden;
    opacity: 0.99;
    transform-origin: center top;
    border: 1px solid rgba(0,0,0,0.06);
    box-shadow: 0 18px 50px rgba(0,0,0,0.22);
  }
  /* When dragging, prevent text selection / highlighting while hovering other sections */
  .upec-dragging, .upec-dragging * {
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    user-select: none !important;
    -webkit-touch-callout: none !important;
  }
`;
if (typeof document !== 'undefined') {
  document.head.appendChild(styleSheet);
}

  interface SectionOption {
    id?: string;
    name: string;
    price: number;
    description?: string;
    linkedRecipeId?: string | null;
    _priceRaw?: string;
  }

interface SectionData {
  name: string;
  description?: string;
  required?: boolean;
  showDescriptions?: boolean;
  hidePrice?: boolean;
  options: SectionOption[];
}

export function AdminPanel() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  // Rola a bakeryId načítané z bakery_members po prihlásení
  const [userRole, setUserRole] = useState<'owner' | 'super_admin' | null>(null);
  const [userBakeryId, setUserBakeryId] = useState<string | null>(null);
  const [userBakeryName, setUserBakeryName] = useState<string | null>(null);
  const [userBakerySlug, setUserBakerySlug] = useState<string | null>(null);
  // Internal mapping: DB key -> display label (built from DB on load)
  const [keyToLabel, setKeyToLabel] = useState<Record<string, string>>({});
  
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  // Password recovery flow (po kliknutí na reset link v emaili)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('admin_remember_email');
      if (stored) {
        setLoginEmail(stored);
        setRememberMe(true);
      }
    } catch (e) {}
  }, []);

  // On mount, try to prefill credentials if we have saved encrypted creds and the IP matches
  async function prefillSavedCredentials() {
    try {
      const blob = window.localStorage.getItem('admin_saved_creds');
      const storedIp = window.localStorage.getItem('admin_saved_ip');
      if (blob && storedIp) {
        const ipNow = await fetchPublicIp();
        if (ipNow && ipNow === storedIp) {
          const txt = await decryptForIp(ipNow, blob);
          if (txt) {
            const parsed = JSON.parse(txt);
            if (parsed?.email) setLoginEmail(parsed.email);
            if (parsed?.password) setLoginPassword(parsed.password);
            setRememberMe(true);
            return;
          }
        }
      }
      // fallback: remember only email
      try {
        const stored = window.localStorage.getItem('admin_remember_email');
        if (stored) {
          setLoginEmail(stored);
          setRememberMe(true);
        }
      } catch (e) {}
    } catch (e) {}
  }

  useEffect(() => {
    prefillSavedCredentials();
  }, []);

  // --- Web Crypto helpers for encrypting remembered credentials ---
  async function fetchPublicIp(): Promise<string | null> {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const j = await res.json();
      return j.ip || null;
    } catch (e) {
      return null;
    }
  }

  async function deriveKeyFromIp(ip: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    // Use SHA-256 digest of the ip + constant salt as raw key material
    const salt = 'upec_remember_salt_v1';
    const raw = await crypto.subtle.digest('SHA-256', enc.encode(ip + salt));
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  function bufToBase64(b: ArrayBuffer) {
    const u8 = new Uint8Array(b);
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }

  function base64ToBuf(s: string) {
    const str = atob(s);
    const u8 = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
    return u8.buffer;
  }

  async function encryptForIp(ip: string, plain: string) {
    const key = await deriveKeyFromIp(ip);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
    // store iv + ct as base64
    return bufToBase64(iv.buffer) + ':' + bufToBase64(ct);
  }

  async function decryptForIp(ip: string, blob: string) {
    try {
      const [ivB64, ctB64] = blob.split(':');
      if (!ivB64 || !ctB64) return null;
      const key = await deriveKeyFromIp(ip);
      const iv = new Uint8Array(base64ToBuf(ivB64));
      const ct = base64ToBuf(ctB64);
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return new TextDecoder().decode(plainBuf);
    } catch (e) {
      return null;
    }
  }

    // Visit statistics state
    interface VisitStats {
      total: number;
      last24h: number;
      uniqueIps: number;
      byDay: Array<{ day: string; count: number }>;
      byCity: Array<{ city: string; country: string; count: number }>;
    }
    const [visitStats, setVisitStats] = useState<VisitStats>({
      total: 0,
      last24h: 0,
      uniqueIps: 0,
      byDay: [],
      byCity: [],
    });
    const [loadingStats, setLoadingStats] = useState(false);

  // Theme
  const { themeId, setTheme } = useTheme();
  const [themeEditMode, setThemeEditMode] = useState(false);
  const [pendingThemeId, setPendingThemeId] = useState<ThemeId>('pink');

  // Admin form state for sections (keyed by DB key, not label)
  const [sections, setSections] = useState<Record<string, SectionData>>({});

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'UI' | 'Recepty' | 'Ingrediencie' | 'Profil'>('UI');
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [hasSectionMetaSortOrder, setHasSectionMetaSortOrder] = useState<boolean | null>(null);

  // Per-section edit mode
  const [editingSectionKeys, setEditingSectionKeys] = useState<Set<string>>(new Set());
  const [sectionsBackup, setSectionsBackup] = useState<Record<string, SectionData>>({});
  // Reorder mode
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderBackup, setReorderBackup] = useState<string[]>([]);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);

  // Ingredients state
  const realDraggedEl = useRef<HTMLElement | null>(null);
  type Unit = 'ml' | 'g' | 'l' | 'kg' | 'ks';
  interface Ingredient { id?: string; name: string; unit: Unit; price: number; packageSize: number; indivisible: boolean }
  const UNITS: Unit[] = ['ml','g','l','kg','ks'];
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // Recipes state
  interface Recipe { id: string; name: string; description: string; created_at?: string }
  interface RecipeIngredient { id: string; recipe_id: string; ingredient_id: string; quantity: number; ingredientName: string; unit: Unit; price: number; packageSize: number; indivisible: boolean }
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeIngredientsByRecipe, setRecipeIngredientsByRecipe] = useState<Record<string, RecipeIngredient[]>>({});
  const [recipeSearchInputs, setRecipeSearchInputs] = useState<Record<string, string>>({});
  const [recipeQuantities, setRecipeQuantities] = useState<Record<string, string>>({});
  const [recipeSelectedIngredients, setRecipeSelectedIngredients] = useState<Record<string, Ingredient | null>>({});
  const [recipeQuantityErrors, setRecipeQuantityErrors] = useState<Record<string, boolean>>({});
  const [recipeIngredientErrors, setRecipeIngredientErrors] = useState<Record<string, boolean>>({});
  const [sectionOptionDropdownOpen, setSectionOptionDropdownOpen] = useState<Record<string, boolean>>({});

  // Edit recipe state
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; description: string; ingredients: Record<string, number>; ingredientsRaw: Record<string, string> }>({ name: '', description: '', ingredients: {}, ingredientsRaw: {} });
  const [savingRecipe, setSavingRecipe] = useState(false);

  // Edit ingredients state
  const [ingredientsEditMode, setIngredientsEditMode] = useState(false);
  const [ingredientsBackup, setIngredientsBackup] = useState<Ingredient[]>([]);
  const [savingIngredients, setSavingIngredients] = useState(false);
  const [ingredientsSortDir, setIngredientsSortDir] = useState<'az' | 'za'>('az');

  // New section modal state
  const [showNewSectionModal, setShowNewSectionModal] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionSaving, setNewSectionSaving] = useState(false);

  // Delete section modal state
  const [deleteSectionModalOpen, setDeleteSectionModalOpen] = useState(false);
  const [deleteSectionKey, setDeleteSectionKey] = useState<string | null>(null);
  const [deleteSectionName, setDeleteSectionName] = useState<string>('');
  const [deleteSectionSaving, setDeleteSectionSaving] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown-container]')) {
        setSectionOptionDropdownOpen({});
      }
      if (!target.closest('[data-section-settings-dropdown]')) {
        document.querySelectorAll('[data-section-settings-menu]').forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      }
      if (!target.closest('[data-sort-dropdown]')) {
        document.querySelectorAll('[data-sort-dropdown-menu]').forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Diameter management state
  const [diameterEnabled, setDiameterEnabled] = useState<Record<string, boolean>>({});
  const [diameterMultipliersMap, setDiameterMultipliersMap] = useState<Record<string, number>>({}); // key: `${sectionKey}:${optionId}`
  const [baseDiameterBySection, setBaseDiameterBySection] = useState<Record<string, string | null>>({});
  const [editingMultiplierKey, setEditingMultiplierKey] = useState<string | null>(null);
  // Layout toggle per section: 'list' (default) or 'grid'
  const [sectionLayout, setSectionLayout] = useState<Record<string, 'list' | 'grid'>>({});
  const [multiplyEnabled, setMultiplyEnabled] = useState<Record<string, boolean>>(() => {
    try {
      const stored = window.localStorage.getItem('upec_multiply_enabled');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  function setMultiplyEnabledForSection(sectionKey: string, enabled: boolean) {
    setMultiplyEnabled(prev => {
      const next = { ...prev, [sectionKey]: enabled };
      try { window.localStorage.setItem('upec_multiply_enabled', JSON.stringify(next)); } catch {}
      return next;
    });
    // Also persist to DB so HomePage picks it up
    supabase.from('section_meta')
      .update({ multiply_enabled: enabled })
      .eq('section', sectionKey)
      .then(({ error }) => { if (error) console.warn('multiply_enabled DB save failed:', error.message); });
  }

  // Farebné schémy pre jednotlivé taby
  const tabColors = {
    UI: { primary: '#ffe0ea', secondary: '#ff9fc4', text: '#d81b60', border: '#ffb3d1' },
    Recepty: { primary: '#f3e5f5', secondary: '#ba68c8', text: '#7b1fa2', border: '#ce93d8' },
    Ingrediencie: { primary: '#e8f5e9', secondary: '#81c784', text: '#2e7d32', border: '#a5d6a7' },
    Profil: { primary: '#fdf4ff', secondary: '#c084fc', text: '#7c3aed', border: '#e9d5ff' }
  };

  const currentColors = tabColors[activeTab];

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (user) {
      // loadUserRole resolves bakeryId and then calls all load functions
      loadUserRole(user.id);
    }
  }, [user]);

  // Načíta rolu a bakery_id prihláseného usera z bakery_members.
  // Ak tabuľka ešte neexistuje (pred migráciou), ticho pokračuje.
  async function loadUserRole(userId: string) {
    let resolvedBakeryId: string | null = null;
    try {
      const { data, error } = await supabase
        .from('bakery_members')
        .select('bakery_id, role')
        .eq('user_id', userId)
        .single();
      if (!error && data) {
        setUserBakeryId(data.bakery_id);
        setUserRole(data.role as 'owner' | 'super_admin');
        resolvedBakeryId = data.bakery_id;
        // Fetch bakery name + slug pre Profil tab
        const { data: bak } = await supabase
          .from('bakeries')
          .select('name, slug')
          .eq('id', data.bakery_id)
          .single();
        if (bak) {
          setUserBakeryName(bak.name);
          setUserBakerySlug(bak.slug);
        }
      }
    } catch {
      // ticho — migrácia ešte nebola spustená
    }
    loadFromDb(resolvedBakeryId);
    loadVisitStats(resolvedBakeryId);
    loadIngredients(resolvedBakeryId);
    loadRecipes(resolvedBakeryId);
  }

  async function checkSession() {
    try {
      // Deteguj password recovery flow z URL hashu
      const hash = window.location.hash;
      if (hash.includes('type=recovery')) {
        setIsPasswordRecovery(true);
        setLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    } catch (err) {
      console.error('Error checking session:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setResetError('Heslo musí mať aspoň 6 znakov.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setResetSuccess(true);
      // Vyčisti hash z URL
      window.history.replaceState(null, '', window.location.pathname);
    } catch (err: any) {
      setResetError(err?.message || 'Nepodarilo sa zmeniť heslo.');
    } finally {
      setResetLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) throw error;
      setUser(data.user);
      // Persist remembered credentials if requested.
      // NOTE: storing passwords client-side can be insecure. We encrypt the password
      // using a key derived from the user's public IP so it is not stored in plaintext.
      try {
        if (rememberMe) {
          // fetch IP and encrypt password
          const ip = await fetchPublicIp();
          if (ip) {
            const encrypted = await encryptForIp(ip, JSON.stringify({ email: loginEmail, password: loginPassword }));
            window.localStorage.setItem('admin_saved_creds', encrypted);
            window.localStorage.setItem('admin_saved_ip', ip);
          } else {
            // fallback: remember only email
            window.localStorage.setItem('admin_remember_email', loginEmail || '');
          }
        } else {
          window.localStorage.removeItem('admin_saved_creds');
          window.localStorage.removeItem('admin_saved_ip');
          window.localStorage.removeItem('admin_remember_email');
        }
      } catch (e) {}
      setLoginEmail('');
      setLoginPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      setUser(null);
      // After signing out, immediately prefill saved credentials (no page refresh required)
      try {
        await prefillSavedCredentials();
      } catch (e) {}
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

    async function loadVisitStats(bakeryIdParam?: string | null) {
      const bid = bakeryIdParam ?? null;
      const withBid = (q: any) => bid ? q.eq('bakery_id', bid) : q;
      setLoadingStats(true);
      try {
        // Total visits
        const { count: total, error: totalErr } = await withBid(
          supabase.from('page_visits').select('*', { count: 'exact', head: true })
        );
        if (totalErr) throw totalErr;

        // Last 24h visits
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: last24h, error: last24hErr } = await withBid(
          supabase.from('page_visits').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo)
        );
        if (last24hErr) throw last24hErr;

        // Unique IPs
        const { data: ipsData, error: ipsErr } = await withBid(
          supabase.from('page_visits').select('ip')
        );
        if (ipsErr) throw ipsErr;
        const uniqueIps = new Set(ipsData?.map((row: any) => row.ip).filter(Boolean)).size;

        // Per-day breakdown (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentData, error: recentErr } = await withBid(
          supabase.from('page_visits').select('created_at').gte('created_at', sevenDaysAgo).order('created_at', { ascending: false })
        );
        if (recentErr) throw recentErr;

        // Group by day
        const dayMap: Record<string, number> = {};
        recentData?.forEach((row: any) => {
          const day = row.created_at.split('T')[0]; // YYYY-MM-DD
          dayMap[day] = (dayMap[day] || 0) + 1;
        });
        const byDay = Object.entries(dayMap)
          .map(([day, count]) => ({ day, count }))
          .sort((a, b) => b.day.localeCompare(a.day)); // newest first

        // City/Country breakdown
        const { data: locationData, error: locationErr } = await withBid(
          supabase.from('page_visits').select('city, country')
        );
        if (locationErr) throw locationErr;

        const cityMap: Record<string, { country: string; count: number }> = {};
        locationData?.forEach((row: any) => {
          // Skip entries with no city
          if (!row.city || !row.country) return;
          
          const key = `${row.city}, ${row.country}`;
          if (!cityMap[key]) {
            cityMap[key] = { country: row.country, count: 0 };
          }
          cityMap[key].count += 1;
        });
        const byCity = Object.entries(cityMap)
          .map(([key, value]) => ({ 
            city: key, 
            country: value.country, 
            count: value.count 
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20); // Top 20 cities

        setVisitStats({
          total: total ?? 0,
          last24h: last24h ?? 0,
          uniqueIps,
          byDay,
          byCity,
        });
      } catch (err) {
        console.error('Error loading visit stats:', err);
      } finally {
        setLoadingStats(false);
      }
    }

  async function loadFromDb(bakeryIdParam?: string | null) {
    const bid = bakeryIdParam ?? null;
    const withBid = (q: any) => bid ? q.eq('bakery_id', bid) : q;
    try {
      // Fetch all section meta (bottom descriptions). Try to detect `sort_order` presence.
      let meta: any[] | null = null;
      let sortOrderSupported = false; // local flag – don't rely on async state

      // Try with name + sort_order + show_description + hide_price + multiply_enabled columns first
      const q1 = supabase
        .from('section_meta')
        .select('section, description, required, sort_order, name, show_description, hide_price, multiply_enabled, layout');
      const { data: d1, error: e1 } = await withBid(q1);
      if (!e1) {
        meta = d1 as any[] | null;
        sortOrderSupported = true;
        setHasSectionMetaSortOrder(true);
      } else {
        // Fallback: try without name column
        const q2 = supabase
          .from('section_meta')
          .select('section, description, required, sort_order, hide_price, multiply_enabled, layout');
        const { data: d2, error: e2 } = await withBid(q2);
        if (!e2) {
          meta = d2 as any[] | null;
          sortOrderSupported = true;
          setHasSectionMetaSortOrder(true);
        } else {
          // Older DB without sort_order
          sortOrderSupported = false;
          setHasSectionMetaSortOrder(false);
          const q3 = supabase
            .from('section_meta')
            .select('section, description, required, hide_price, multiply_enabled, layout');
          const { data: d3, error: e3 } = await withBid(q3);
          if (e3) {
            // Oldest DB without multiply_enabled
            const q4 = supabase
              .from('section_meta')
              .select('section, description, required, hide_price');
            const { data: d4, error: e4 } = await withBid(q4);
            if (e4) throw e4;
            meta = (d4 as any[] | null) || [];
          } else {
            meta = (d3 as any[] | null) || [];
          }
        }
      }

      // Fetch all options
      const qOpts = supabase
        .from('section_options')
        .select('id, section, name, price, description, sort_order')
        .order('section', { ascending: true })
        .order('sort_order', { ascending: true });
      const { data: opts, error: optsErr } = await withBid(qOpts);
      if (optsErr) throw optsErr;

      // Dynamically build section list from DB keys (meta and options)
      const keysFromMeta = (meta || []).map(m => m.section);
      const keysFromOpts = Array.from(new Set((opts || []).map((o: any) => o.section)));
      const allKeysSet = new Set<string>([...keysFromMeta, ...keysFromOpts]);

      // Helper: turn key into a readable label if unknown
      const toLabel = (key: string) => key
        .split('_')
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');

      const nextSections: Record<string, SectionData> = {};
      const nextKeyToLabel: Record<string, string> = {};

      for (const key of allKeysSet) {
        const metaRow = (meta || []).find((m: any) => m.section === key) as any;
        const sectionDesc = metaRow?.description || '';
        const sectionName = metaRow?.name || '';
        // Label: prefer name column, fall back to description (legacy), then generate from key
        const isPlaceholder = !sectionName && (!sectionDesc || sectionDesc.toLowerCase().includes('spodny popis') || sectionDesc.toLowerCase().includes('spodný popis'));
        const label = sectionName || (isPlaceholder ? toLabel(key) : sectionDesc);
        // Description is always the DB description value (independent of label)
        const actualDescription = sectionDesc;
        
        nextKeyToLabel[key] = label;
        const sectionRequired = Boolean(metaRow?.required);
        const sectionOptions = (opts || [])
          .filter((o: any) => o.section === key)
          .map((o: any) => ({ id: o.id, name: o.name || '', price: Number(o.price) || 0, description: o.description || '' }));
        
        nextSections[key] = { 
          name: label, 
          description: actualDescription, 
          required: sectionRequired, 
          showDescriptions: Boolean(metaRow?.show_description),
          hidePrice: Boolean(metaRow?.hide_price),
          options: sectionOptions 
        };
      }

      // Initialize multiplyEnabled from DB (multiply_enabled column); fall back to localStorage
      const multiplyFromDb: Record<string, boolean> = {};
      let hasMultiplyColumn = false;
      for (const key of allKeysSet) {
        const metaRow = (meta || []).find((m: any) => m.section === key) as any;
        if (metaRow && typeof metaRow.multiply_enabled !== 'undefined') {
          hasMultiplyColumn = true;
          multiplyFromDb[key] = metaRow.multiply_enabled !== false; // null → true
        }
      }
      if (hasMultiplyColumn) {
        setMultiplyEnabled(prev => {
          const merged = { ...prev, ...multiplyFromDb };
          try { window.localStorage.setItem('upec_multiply_enabled', JSON.stringify(merged)); } catch {}
          return merged;
        });
      }

      // Initialize sectionLayout from DB
      const layoutFromDb: Record<string, 'list' | 'grid'> = {};
      for (const key of allKeysSet) {
        const metaRow = (meta || []).find((m: any) => m.section === key) as any;
        if (metaRow && metaRow.layout) {
          layoutFromDb[key] = metaRow.layout === 'grid' ? 'grid' : 'list';
        }
      }
      if (Object.keys(layoutFromDb).length > 0) {
        setSectionLayout(prev => ({ ...prev, ...layoutFromDb }));
      }

      // Update state atomically
      setKeyToLabel(nextKeyToLabel);
      setSections(nextSections);
      // Initialize section order: prefer `sort_order` from meta when available,
      // otherwise use discovered keys (meta keys first, then option-only keys)
      try {
        let orderedKeys: string[] = [];
        if (meta && meta.length && meta.some((m: any) => m && typeof m.sort_order !== 'undefined')) {
          orderedKeys = (meta as any[])
            .slice()
            .sort((a: any, b: any) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
            .map((m: any) => m.section)
            // append any keys not present in meta (from options)
            .concat(keysFromOpts.filter(k => !meta.some((m: any) => m.section === k)));
          setHasSectionMetaSortOrder(true);
        } else {
          orderedKeys = [...allKeysSet];
        }
        // If DB supports sort_order, use the DB-derived order as the source of truth.
        // Only fall back to localStorage when sort_order is NOT available.
        if (!sortOrderSupported) {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              const stored = window.localStorage.getItem('upec_section_order');
              if (stored) {
                const arr = JSON.parse(stored) as string[];
                if (Array.isArray(arr) && arr.length) {
                  // Merge: use stored order but append any new keys from DB that aren't in localStorage
                  const storedSet = new Set(arr);
                  const merged = [...arr, ...orderedKeys.filter(k => !storedSet.has(k))];
                  orderedKeys = merged;
                }
              }
            }
          } catch (e) {
            // ignore
          }
        }
        setSectionOrder(orderedKeys);
      } catch (e) {
        setSectionOrder([...allKeysSet]);
      }
      // load which sections have diameter entries
      // Load which sections have diameter entries and load their multipliers
      try {
        let dq = supabase.from('diameter_multipliers').select('section_key');
        if (bid) dq = (dq as any).eq('bakery_id', bid);
        const { data: keysRows, error: keysErr } = await dq;
        if (!keysErr && keysRows) {
          const keys = Array.from(new Set((keysRows || []).map((r: any) => r.section_key).filter(Boolean)));
          const map: Record<string, boolean> = {};
          keys.forEach(k => { map[k] = true; });
          setDiameterEnabled(map);
          for (const sk of keys) {
            try { await loadDiameterMultipliers(sk, bid); } catch (e) { console.warn('Failed to load multipliers for', sk, e); }
          }
        }
      } catch (e) {
        console.warn('Warning: loading diameter sections failed on startup', e);
      }
    } catch (err) {
      console.error('Load from DB failed:', err);
      alert('⚠️ Nepodarilo sa načítať dáta z databázy');
    }
  }

  // Load ingredients list
  async function loadIngredients(bakeryIdParam?: string | null) {
    try {
      let q = supabase
        .from('ingredients')
        .select('id, name, unit, price, package_size, indivisible')
        .order('created_at', { ascending: false });
      if (bakeryIdParam) q = (q as any).eq('bakery_id', bakeryIdParam);
      const { data, error } = await q;
      if (error) throw error;
      setIngredients((data || []).map((r: any) => ({
        id: r.id,
        name: r.name || '',
        unit: (r.unit as Unit) || 'ml',
        price: Number(r.price) || 0,
        packageSize: Number(r.package_size) || 100,
        indivisible: Boolean(r.indivisible),
      })).sort((a, b) => a.name.localeCompare(b.name, 'sk')));
    } catch (err) {
      console.error('Load ingredients failed:', err);
    }
  }

  async function loadDiameterMultipliers(sectionKey: string, bakeryId?: string | null) {
    try {
      const bid = bakeryId ?? userBakeryId;
      let q = supabase.from('diameter_multipliers').select('*').eq('section_key', sectionKey);
      if (bid) q = (q as any).eq('bakery_id', bid);
      const { data, error } = await q;
      if (error) throw error;
      const map: Record<string, number> = {};
      let baseId: string | null = null;
      (data || []).forEach((d: any) => {
        const k = `${sectionKey}:${d.option_id}`;
        map[k] = Number(d.multiplier) || 1;
        if (d.base_option_id) baseId = d.base_option_id;
      });
      setDiameterMultipliersMap(prev => ({ ...prev, ...map }));
      setBaseDiameterBySection(prev => ({ ...prev, [sectionKey]: baseId || null }));
    } catch (err) {
      console.error('Load diameter multipliers failed:', err);
    }
  }

  async function toggleDiameterSection(sectionKey: string, enable: boolean, allOptions: Array<{ id?: string; name: string }>) {
    try {
      if (!enable) {
        let dq = supabase.from('diameter_multipliers').delete().eq('section_key', sectionKey);
        if (userBakeryId) dq = (dq as any).eq('bakery_id', userBakeryId);
        const { error } = await dq;
        if (error) throw error;
        setDiameterEnabled(prev => ({ ...prev, [sectionKey]: false }));
        setMultiplyEnabledForSection(sectionKey, false);
        // remove from maps
        setBaseDiameterBySection(prev => { const c = { ...prev }; delete c[sectionKey]; return c; });
        setDiameterMultipliersMap(prev => {
          const copy = { ...prev };
          Object.keys(prev).forEach(k => { if (k.startsWith(sectionKey + ':')) delete copy[k]; });
          return copy;
        });
        return;
      }

      // create default entries with multiplier 1
      // Resolve current DB option ids for this section (match by name)
      const { data: dbOpts = [], error: dbErr } = await supabase
        .from('section_options')
        .select('id, name')
        .eq('section', sectionKey);
      if (dbErr) throw dbErr;
      const nameToId: Record<string, string> = {};
      (dbOpts || []).forEach((r: any) => { if (r?.id && r?.name) nameToId[r.name] = r.id; });

      const entries = (allOptions || []).map(o => {
        const dbId = nameToId[o.name];
        return dbId ? {
          section_key: sectionKey,
          base_option_id: null,
          option_id: dbId,
          multiplier: 1.0,
          ...(userBakeryId ? { bakery_id: userBakeryId } : {}),
        } : null;
      }).filter(Boolean) as any[];
      const { error } = await supabase.from('diameter_multipliers').insert(entries);
      if (error) throw error;
      setDiameterEnabled(prev => ({ ...prev, [sectionKey]: true }));
      // Auto-enable násobenie aktívne for all sections when a multiplier source is activated
      const allSectionKeys = Object.keys(sections);
      setMultiplyEnabled(prev => {
        const next = { ...prev };
        allSectionKeys.forEach(k => { next[k] = true; });
        try { window.localStorage.setItem('upec_multiply_enabled', JSON.stringify(next)); } catch {}
        return next;
      });
      // Persist to DB for all sections
      for (const sk of allSectionKeys) {
        supabase.from('section_meta')
          .update({ multiply_enabled: true })
          .eq('section', sk)
          .then(({ error }) => { if (error) console.warn('multiply_enabled DB update failed for', sk, error.message); });
      }
      await loadDiameterMultipliers(sectionKey, userBakeryId);
    } catch (err) {
      console.error('Toggle diameter section failed:', err);
      alert('⚠️ Nepodarilo sa zapnúť/vypnúť správu priemerov');
    }
  }

  async function updateMultiplier(sectionKey: string, optionId: string, newMultiplier: number) {
    try {
      // round to 1 decimal before saving
      const rounded = Math.round((newMultiplier || 1) * 10) / 10;
      let uq = supabase.from('diameter_multipliers').update({ multiplier: rounded }).eq('section_key', sectionKey).eq('option_id', optionId);
      if (userBakeryId) uq = (uq as any).eq('bakery_id', userBakeryId);
      const { error } = await uq;
      if (error) throw error;
      setDiameterMultipliersMap(prev => ({ ...prev, [`${sectionKey}:${optionId}`]: rounded }));
    } catch (err) {
      console.error('Update multiplier failed:', err);
      alert('⚠️ Nepodarilo sa aktualizovať násobok');
    }
  }

  function addIngredient() {
    setIngredients(prev => [{ name: '', unit: 'ml', price: 0, packageSize: 100, indivisible: false }, ...prev]);
  }

  function updateIngredient(index: number, field: keyof Omit<Ingredient,'id'>, value: any) {
    setIngredients(prev => prev.map((it, i) => i === index ? { ...it, [field]: value } : it));
  }

  async function removeIngredient(index: number) {
    const it = ingredients[index];
    try {
      if (it?.id) {
        const { error } = await supabase.from('ingredients').delete().eq('id', it.id);
        if (error) throw error;
      }
      setIngredients(prev => prev.filter((_, i) => i !== index));
    } catch (err) {
      console.error('Delete ingredient failed:', err);
      alert('⚠️ Nepodarilo sa odstrániť ingredienciu');
    }
  }

  function startEditIngredients() {
    setIngredientsBackup(JSON.parse(JSON.stringify(ingredients)));
    setIngredientsEditMode(true);
  }

  function cancelEditIngredients() {
    setIngredients(ingredientsBackup);
    setIngredientsEditMode(false);
    setIngredientsBackup([]);
  }

  async function saveIngredients() {
    setSavingIngredients(true);
    try {
      for (const it of ingredients) {
        const name = (it.name || '').trim();
        if (!name) continue;
        const payload = {
          name,
          unit: it.unit,
          price: Number((it.price ?? 0).toFixed(2)),
          package_size: Number((it.packageSize ?? 0).toFixed(2)),
          indivisible: Boolean(it.indivisible),
        };
        if (it.id) {
          const { error } = await supabase.from('ingredients').update(payload).eq('id', it.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('ingredients').insert(payload).select('id').single();
          if (error) throw error;
          if (data?.id) it.id = data.id;
        }
      }
      // Re-fetch recipes so recipe ingredient prices are updated
      await loadRecipes();
      // Re-fetch ingredients to get clean state
      await loadIngredients();
      setIngredientsEditMode(false);
      setIngredientsBackup([]);
    } catch (err) {
      console.error('Save ingredients failed:', err);
      alert('⚠️ Nepodarilo sa uložiť ingrediencie');
    } finally {
      setSavingIngredients(false);
    }
  }

  // ===== RECIPES FUNCTIONS =====
  async function loadRecipes(bakeryIdParam?: string | null) {
    try {
      let qRecipes = supabase
        .from('recipes')
        .select('id, name, description, created_at')
        .order('created_at', { ascending: false });
      if (bakeryIdParam) qRecipes = (qRecipes as any).eq('bakery_id', bakeryIdParam);
      const { data: recipesData, error: recipesErr } = await qRecipes;
      if (recipesErr) throw recipesErr;

      setRecipes((recipesData || []) as Recipe[]);

      // Load recipe ingredients for each recipe
      if (recipesData && recipesData.length > 0) {
        const recipeIds = recipesData.map((r: any) => r.id);
        const { data: ingData, error: ingErr } = await supabase
          .from('recipe_ingredients')
          .select(
            'id, recipe_id, ingredient_id, quantity, ingredients(name, unit, price, package_size, indivisible)'
          )
          .in('recipe_id', recipeIds);
        if (ingErr) throw ingErr;

        const byRecipe: Record<string, RecipeIngredient[]> = {};
        recipeIds.forEach((rid: string) => {
          byRecipe[rid] = [];
        });

        (ingData || []).forEach((ri: any) => {
          const ing = ri.ingredients;
          byRecipe[ri.recipe_id].push({
            id: ri.id,
            recipe_id: ri.recipe_id,
            ingredient_id: ri.ingredient_id,
            quantity: ri.quantity,
            ingredientName: ing?.name || '',
            unit: ing?.unit as Unit || 'g',
            price: ing?.price || 0,
            packageSize: ing?.package_size ? Number(ing.package_size) : 100,
            indivisible: Boolean(ing?.indivisible),
          });
        });

        setRecipeIngredientsByRecipe(byRecipe);
      }
    } catch (err) {
      console.error('Load recipes failed:', err);
    }
  }

  async function addNewRecipe(name: string, description: string) {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .insert({ name, description })
        .select('id, name, description, created_at')
        .single();
      if (error) throw error;

      setRecipes((prev) => [data as Recipe, ...prev]);
      setRecipeIngredientsByRecipe((prev) => ({
        ...prev,
        [data.id]: [],
      }));
    } catch (err) {
      console.error('Add recipe failed:', err);
      alert('⚠️ Nepodarilo sa vytvoriť recept');
    }
  }

  async function deleteRecipe(recipeId: string) {
    if (!confirm('Naozaj chcete zmazať tento recept?')) return;
    try {
      // Delete related ingredients first
      const { error: delIngErr } = await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('recipe_id', recipeId);
      if (delIngErr) throw delIngErr;

      // Delete recipe
      const { error: delRecipeErr } = await supabase
        .from('recipes')
        .delete()
        .eq('id', recipeId);
      if (delRecipeErr) throw delRecipeErr;

      setRecipes((prev) => prev.filter((r) => r.id !== recipeId));
      setRecipeIngredientsByRecipe((prev) => {
        const next = { ...prev };
        delete next[recipeId];
        return next;
      });
    } catch (err) {
      console.error('Delete recipe failed:', err);
      alert('⚠️ Nepodarilo sa zmazať recept');
    }
  }

  async function addRecipeIngredient(
    recipeId: string,
    ingredientId: string,
    ingredientName: string,
    quantity: number,
    unit: Unit,
    price: number,
    packageSize: number,
    indivisible: boolean,
  ) {
    try {
      const { data, error } = await supabase
        .from('recipe_ingredients')
        .insert({
          recipe_id: recipeId,
          ingredient_id: ingredientId,
          quantity,
        })
        .select('id')
        .single();
      if (error) throw error;

      setRecipeIngredientsByRecipe((prev) => ({
        ...prev,
        [recipeId]: [
          ...(prev[recipeId] || []),
          {
            id: data.id,
            recipe_id: recipeId,
            ingredient_id: ingredientId,
            quantity,
            ingredientName,
            unit,
            price,
            packageSize,
            indivisible,
          },
        ],
      }));
    } catch (err) {
      console.error('Add recipe ingredient failed:', err);
      alert('⚠️ Nepodarilo sa pridať surovinu');
    }
  }

  async function removeRecipeIngredient(recipeId: string, ingredientId: string) {
    try {
      const { error } = await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('id', ingredientId);
      if (error) throw error;

      setRecipeIngredientsByRecipe((prev) => ({
        ...prev,
        [recipeId]: prev[recipeId].filter((ri) => ri.id !== ingredientId),
      }));
    } catch (err) {
      console.error('Remove recipe ingredient failed:', err);
      alert('⚠️ Nepodarilo sa odstrániť surovinu');
    }
  }

  function startEditRecipe(recipe: Recipe) {
    setEditingRecipeId(recipe.id);
    const ings = recipeIngredientsByRecipe[recipe.id] || [];
    const qtyMap: Record<string, number> = {};
    const rawMap: Record<string, string> = {};
    ings.forEach(ri => { qtyMap[ri.id] = ri.quantity; rawMap[ri.id] = String(ri.quantity); });
    setEditDraft({ name: recipe.name, description: recipe.description, ingredients: qtyMap, ingredientsRaw: rawMap });
  }

  function cancelEditRecipe() {
    setEditingRecipeId(null);
    setEditDraft({ name: '', description: '', ingredients: {}, ingredientsRaw: {} });
  }

  async function saveRecipeEdits() {
    if (!editingRecipeId) return;
    setSavingRecipe(true);
    try {
      // Update recipe name & description
      const { error: recipeErr } = await supabase
        .from('recipes')
        .update({ name: editDraft.name, description: editDraft.description })
        .eq('id', editingRecipeId);
      if (recipeErr) throw recipeErr;

      // Update each ingredient quantity
      for (const [riId, qty] of Object.entries(editDraft.ingredients)) {
        const { error: ingErr } = await supabase
          .from('recipe_ingredients')
          .update({ quantity: qty })
          .eq('id', riId);
        if (ingErr) throw ingErr;
      }

      // Update local state
      setRecipes(prev => prev.map(r => r.id === editingRecipeId ? { ...r, name: editDraft.name, description: editDraft.description } : r));
      setRecipeIngredientsByRecipe(prev => ({
        ...prev,
        [editingRecipeId]: (prev[editingRecipeId] || []).map(ri => ({
          ...ri,
          quantity: editDraft.ingredients[ri.id] ?? ri.quantity,
        })),
      }));

      setEditingRecipeId(null);
      setEditDraft({ name: '', description: '', ingredients: {}, ingredientsRaw: {} });
    } catch (err) {
      console.error('Save recipe edits failed:', err);
      alert('⚠️ Nepodarilo sa uložiť zmeny receptu');
    } finally {
      setSavingRecipe(false);
    }
  }

  // Helper: get ingredient cost with optional quantity override (for edit mode preview)
  function getIngredientCostWithQty(ri: RecipeIngredient, overrideQty?: number): number {
    const pkg = ri.packageSize && ri.packageSize > 0 ? ri.packageSize : 1;
    const price = Number(ri.price) || 0;
    const qty = overrideQty ?? ri.quantity;
    let cost: number;
    if (ri.indivisible) {
      const packagesNeeded = Math.ceil(qty / pkg);
      cost = packagesNeeded * price;
    } else {
      cost = (qty / pkg) * price;
    }
    return Math.round(cost * 100) / 100;
  }

  function getRecipeTotalPrice(recipeId: string): number {
    const recipeIngs = recipeIngredientsByRecipe[recipeId] || [];
    const total = recipeIngs.reduce((sum, ri) => sum + getIngredientCostWithQty(ri), 0);
    return Math.round(total * 100) / 100;
  }

  function addOption(sectionKey: string) {
    setSections(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        options: [...prev[sectionKey].options, { name: '', price: 0 }]
      }
    }));
  }

  function removeOption(sectionKey: string, index: number) {
    setSections(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        options: prev[sectionKey].options.filter((_, i) => i !== index)
      }
    }));
  }

  function updateOption(sectionKey: string, index: number, field: 'name' | 'price' | 'description' | 'linkedRecipeId', value: any) {
    setSections(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        options: prev[sectionKey].options.map((opt, i) => 
          i === index ? { ...opt, [field]: value } : opt
        )
      }
    }));
  }

  function updateSectionDescription(sectionKey: string, value: string) {
    setSections(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        description: value,
      }
    }));
  }

  async function removeSection(sectionKey: string) {
    const label = keyToLabel[sectionKey] || sectionKey;
    setDeleteSectionKey(sectionKey);
    setDeleteSectionName(label);
    setDeleteSectionModalOpen(true);
  }

  async function actuallyRemoveSection(sectionKey: string) {
    setDeleteSectionSaving(true);
    try {
      let dmq = supabase.from('diameter_multipliers').delete().eq('section_key', sectionKey);
      if (userBakeryId) dmq = (dmq as any).eq('bakery_id', userBakeryId);
      await dmq;
      const { error: delOptsErr } = await supabase.from('section_options').delete().eq('section', sectionKey);
      if (delOptsErr) throw delOptsErr;
      const { error: delMetaErr } = await supabase.from('section_meta').delete().eq('section', sectionKey);
      if (delMetaErr) throw delMetaErr;
    } catch (err) {
      console.error('Delete section from DB failed:', err);
      alert('⚠️ Nepodarilo sa odstrániť sekciu z databázy');
      setDeleteSectionSaving(false);
      setDeleteSectionModalOpen(false);
      setDeleteSectionKey(null);
      setDeleteSectionName('');
      return;
    }
    setSections(prev => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
    setKeyToLabel(prev => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
    setSectionOrder(prev => prev.filter(k => k !== sectionKey));
    setDiameterEnabled(prev => { const n = { ...prev }; delete n[sectionKey]; return n; });
    // Close modal and clear delete state
    setDeleteSectionSaving(false);
    setDeleteSectionModalOpen(false);
    setDeleteSectionKey(null);
    setDeleteSectionName('');
    try { if (typeof window !== 'undefined' && window.localStorage) { window.localStorage.setItem('upec_section_order', JSON.stringify((sectionOrder || []).filter(k => k !== sectionKey))); } } catch (e) {}
  }

  async function addNewSection() {
    const label = newSectionName.trim();
    if (!label) return;
    // Generate a unique key for database
    const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    // Check if key already exists
    if (sections[key]) {
      alert('Sekcia s týmto kľúčom už existuje!');
      return;
    }
    setNewSectionSaving(true);
    try {
      // Shift all existing sort_orders up by 1
      const newOrder = [key, ...sectionOrder];
      for (let i = 0; i < newOrder.length; i++) {
        let uq = supabase
          .from('section_meta')
          .update({ sort_order: i })
          .eq('section', newOrder[i]);
        if (userBakeryId) uq = (uq as any).eq('bakery_id', userBakeryId);
        await uq;
      }
      // Insert into DB
      const metaPayload: any = {
        section: key,
        description: '',
        required: false,
        name: label,
        sort_order: 0,
        show_description: false,
        ...(userBakeryId ? { bakery_id: userBakeryId } : {}),
      };
      const { error } = await supabase
        .from('section_meta')
        .insert(metaPayload);
      if (error) throw error;
      // Update local state
      setKeyToLabel(prev => ({ ...prev, [key]: label }));
      setSections(prev => ({
        ...prev,
        [key]: { name: label, description: '', required: false, options: [] }
      }));
      setSectionOrder(newOrder);
      // Save order to localStorage too
      try { window.localStorage.setItem('upec_section_order', JSON.stringify(newOrder)); } catch (e) {}
      setShowNewSectionModal(false);
      setNewSectionName('');
    } catch (err) {
      console.error('Failed to create section:', err);
      alert('⚠️ Nepodarilo sa vytvoriť sekciu');
    } finally {
      setNewSectionSaving(false);
    }
  }

  async function saveReorder() {
    setSaving(true);
    try {
      let useSortOrder = Boolean(hasSectionMetaSortOrder);
      if (hasSectionMetaSortOrder === null) {
        try {
          const { error: tErr } = await supabase.from('section_meta').select('sort_order').limit(1);
          useSortOrder = !tErr;
          setHasSectionMetaSortOrder(useSortOrder);
        } catch (e) { useSortOrder = false; setHasSectionMetaSortOrder(false); }
      }
      if (useSortOrder) {
        for (let i = 0; i < sectionOrder.length; i++) {
          let uq = supabase
            .from('section_meta')
            .update({ sort_order: i })
            .eq('section', sectionOrder[i]);
          if (userBakeryId) uq = (uq as any).eq('bakery_id', userBakeryId);
          const { error } = await uq;
          if (error) throw error;
        }
      }
      // Also save to localStorage as fallback
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('upec_section_order', JSON.stringify(sectionOrder));
        }
      } catch (e) {}
      setReorderMode(false);
      setReorderBackup([]);
    } catch (err) {
      console.error('Save reorder failed:', err);
      alert('⚠️ Nepodarilo sa uložiť poradie sekcií');
    } finally {
      setSaving(false);
    }
  }

  // Drag & drop handlers for reordering sections
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const placeholderNode = useRef<HTMLElement | null>(null);
  const sectionListContainer = useRef<HTMLElement | null>(null);
  const draggedClone = useRef<HTMLElement | null>(null);
  const pointerDragging = useRef<boolean>(false);
  const pointerIdRef = useRef<number | null>(null);

  function setSectionRef(key: string, el: HTMLElement | null) {
    sectionRefs.current[key] = el;
  }

  // FLIP animation for reordering: animate elements from their previous position to new
  function animateReorder(prevOrder: string[], nextOrder: string[]) {
    try {
      const beforeRects: Record<string, DOMRect> = {};
      prevOrder.forEach(k => {
        const el = sectionRefs.current[k];
        if (el) beforeRects[k] = el.getBoundingClientRect();
      });

      // Allow DOM to update with new order first
      requestAnimationFrame(() => {
        const afterRects: Record<string, DOMRect> = {};
        nextOrder.forEach(k => {
          const el = sectionRefs.current[k];
          if (el) afterRects[k] = el.getBoundingClientRect();
        });

        nextOrder.forEach(k => {
          const el = sectionRefs.current[k];
          const before = beforeRects[k];
          const after = afterRects[k];
          if (!el || !before || !after) return;
          const dx = before.left - after.left;
          const dy = before.top - after.top;
          if (dx === 0 && dy === 0) return;
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          // trigger reflow
          el.getBoundingClientRect();
          el.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
          el.style.transform = '';
          const cleanup = () => {
            el.style.transition = '';
            el.style.transform = '';
            el.removeEventListener('transitionend', cleanup);
          };
          el.addEventListener('transitionend', cleanup);
        });
      });
    } catch (e) {
      // ignore animation errors
    }
  }
  

  // Unified finalizer for any drag type (clone-based or real-element)
  function finalizeDragCleanup() {
    try {
      // remove any global listeners that may have been attached during drag
      try {
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', handlePointerUp);
        document.removeEventListener('dragover', handleDocumentDragOver);
        document.removeEventListener('drop', handleDocumentDrop);
        window.removeEventListener('blur', handleWindowBlur as any);
        document.removeEventListener('visibilitychange', handleVisibilityChange as any);
      } catch (e) {}

      const dragged = draggingKey;
      const ph = placeholderNode.current;
      const parent = sectionListContainer.current || (ph ? ph.parentElement : null);

      // Remove any visual clone
      const clone = draggedClone.current;
      if (clone) {
        try { clone.remove(); } catch (e) {}
        draggedClone.current = null;
      }

      // If we had moved the real DOM element into body, reinsert it at the placeholder
      const real = realDraggedEl.current;
      if (real) {
        try {
          if (ph && ph.parentElement) {
            ph.parentElement.insertBefore(real, ph);
          } else if (parent) {
            parent.appendChild(real);
          }
        } catch (e) {}
        // reset inline styles applied during drag
        try {
          real.style.position = '';
          real.style.left = '';
          real.style.top = '';
          real.style.width = '';
          real.style.zIndex = '';
          real.style.pointerEvents = '';
          real.style.boxShadow = '';
          realDraggedEl.current = null;
        } catch (e) {}
      }

      // Restore opacity/pointer for the original element if still present in refs
      if (dragged) {
        const el = sectionRefs.current[dragged];
        if (el) {
          try { el.style.opacity = ''; el.style.pointerEvents = ''; } catch (e) {}
        }
      }

      // Remove placeholder and compute new order
      if (ph && parent) {
        try { ph.remove(); } catch (e) {}
        placeholderNode.current = null;

        const prev = sectionOrder.slice();
        const keys: string[] = [];
        Array.from(parent.querySelectorAll('[data-section-key]')).forEach((node: Element) => {
          const k = node.getAttribute('data-section-key');
          if (k) keys.push(k);
        });
        try { animateReorder(prev, keys); } catch (err) {}
        setSectionOrder(keys);
      }
    } catch (err) {
      console.warn('finalizeDragCleanup failed', err);
    } finally {
      try { document.body.classList.remove('upec-dragging'); document.body.style.cursor = ''; } catch (e) {}
      setDraggingKey(null);

      sectionListContainer.current = null;
      pointerDragging.current = false;
      pointerIdRef.current = null;
    }
  }

  function handleWindowBlur() {
    try { finalizeDragCleanup(); } catch (e) {}
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      try { finalizeDragCleanup(); } catch (e) {}
    }
  }

  // Pointer-based fallback for more reliable dragging (mouse/touch)
  function onPointerDownSection(e: React.PointerEvent<HTMLElement>, key: string) {
    // only primary button
    if ((e as any).button && (e as any).button !== 0) return;
    if (draggingKey) return;
    // If pointer originates from an interactive control (input, textarea, select, button, etc.), don't start drag.
    try {
      const tgt = (e.target as HTMLElement | null);
      if (tgt) {
        if (tgt.closest('input, textarea, select, button, [data-dropdown-container]')) return;
      }
    } catch (err) {}
    pointerDragging.current = true;
    pointerIdRef.current = (e as any).pointerId || null;
    // synthesize a drag start using the same clone/placeholder flow
    try {
      const el = sectionRefs.current[key];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const parent = el.parentElement as HTMLElement | null;
      if (!parent) return;
      sectionListContainer.current = parent;
      setDraggingKey(key);

      const ph = document.createElement('div');
      ph.style.width = `${rect.width}px`;
      ph.style.height = `${rect.height}px`;
      ph.style.boxSizing = 'border-box';
      ph.style.margin = getComputedStyle(el).margin || '';
      ph.className = 'upec-section-placeholder';
      parent.insertBefore(ph, el);
      placeholderNode.current = ph;

      // Detach the real element and move it to document.body so the user is dragging
      // the actual section DOM node (no clone). Insert placeholder to keep layout.
      try {
        parent.removeChild(el);
        document.body.appendChild(el);
        realDraggedEl.current = el;
        el.style.position = 'fixed';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${rect.width}px`;
        el.style.zIndex = '9999';
        el.style.pointerEvents = 'none';
        el.style.boxShadow = '0 14px 40px rgba(0,0,0,0.18)';
      } catch (err) {
        console.warn('real-drag detach failed', err);
      }

      setDragOffsetY((e.clientY || 0) - rect.top || 0);

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
      window.addEventListener('blur', handleWindowBlur as any);
      document.addEventListener('visibilitychange', handleVisibilityChange as any);
      try { document.body.classList.add('upec-dragging'); document.body.style.cursor = 'grabbing'; } catch (e) {}
    } catch (err) {
      console.warn('pointer drag start failed', err);
      pointerDragging.current = false;
      pointerIdRef.current = null;
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!pointerDragging.current) return;
    const ph = placeholderNode.current;
    const parent = sectionListContainer.current;
    const draggedEl = realDraggedEl.current || draggedClone.current;
    if (!draggedEl || !ph || !parent) return;
    try {
      const clientY = e.clientY || 0;
      const top = clientY - dragOffsetY;
      draggedEl.style.top = `${top}px`;
    } catch (err) {}

    // reposition placeholder among parent's children
    const children = Array.from(parent.children).filter(c => c !== ph);
    let inserted = false;
    for (const child of children) {
      const rect = (child as HTMLElement).getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if ((e.clientY || 0) < mid) {
        if (ph.nextSibling !== child) parent.insertBefore(ph, child);
        inserted = true;
        break;
      }
    }
    if (!inserted) parent.appendChild(ph);
  }

  function handlePointerUp() {
    if (!pointerDragging.current) return;
    pointerDragging.current = false;
    pointerIdRef.current = null;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);

    // finalize similar to document drop
    try {
      finalizeDragCleanup();
    } catch (err) {
      console.warn('pointer up finalize failed', err);
    }
  }

  function onDragOverSection(e: React.DragEvent<HTMLElement>) {
    // keep this noop - actual placeholder movement handled by document dragover
    e.preventDefault();
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch (e) {}
  }

  function handleDocumentDragOver(e: Event) {
    const ev = e as DragEvent;
    ev.preventDefault?.();
    const draggedKey = draggingKey;
    if (!draggedKey) return;
    const ph = placeholderNode.current;
    const parent = sectionListContainer.current;
    const draggedEl = realDraggedEl.current || draggedClone.current;
    if (!draggedEl || !ph || !parent) return;

    // move the detached element to follow pointer
    try {
      const clientY = ev.clientY || 0;
      const top = clientY - dragOffsetY;
      draggedEl.style.top = `${top}px`;
    } catch (err) {}

    // compute insertion point among parent's children (excluding placeholder)
    const children = Array.from(parent.children).filter(c => c !== ph);
    let inserted = false;
    for (const child of children) {
      const rect = (child as HTMLElement).getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if ((ev.clientY || 0) < mid) {
        if (ph.nextSibling !== child) parent.insertBefore(ph, child);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      parent.appendChild(ph);
    }
  }

  function handleDocumentDrop(e: Event) {
    try {
      (e as DragEvent).preventDefault?.();
      document.removeEventListener('dragover', handleDocumentDragOver);
      document.removeEventListener('drop', handleDocumentDrop);
      try { finalizeDragCleanup(); } catch (err) { console.warn('document drop finalize failed', err); }
    } catch (err) {
      console.warn('document drop failed', err);
    } finally {
      // finalizeDragCleanup already resets state; ensure listeners removed
      sectionListContainer.current = null;
    }
  }

  function onDropSection(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    try {
      // remove document listeners
      document.removeEventListener('dragover', handleDocumentDragOver);
      document.removeEventListener('drop', handleDocumentDrop);
      try { finalizeDragCleanup(); } catch (err) { console.warn('drop finalize failed', err); }
    } catch (err) {
      console.warn('drop finalize failed', err);
    } finally {
      // finalizeDragCleanup already resets state
      sectionListContainer.current = null;
    }
  }

  function onDragEndSection() {
    // If drag ends without drop, cleanup
    try {
      document.removeEventListener('dragover', handleDocumentDragOver);
      document.removeEventListener('drop', handleDocumentDrop);
      try { finalizeDragCleanup(); } catch (err) { console.warn('drag end cleanup failed', err); }
        } catch (err) {
          console.warn('drag end cleanup failed', err);
        }
        // finalizeDragCleanup resets draggingKey
  }

  // Rename section: updates display label in section_meta
  async function renameSection(sectionKey: string, newLabelRaw: string) {
    const newLabel = (newLabelRaw || '').trim();
    if (!newLabel) return;
    const oldLabel = keyToLabel[sectionKey];
    if (oldLabel === newLabel) return;

    // Update local mapping only – DB save happens via handleSaveSection
    setKeyToLabel(prev => ({
      ...prev,
      [sectionKey]: newLabel,
    }));
    setSections(prev => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], name: newLabel },
    }));
  }

  // Save a single UI section to the database
  async function handleSaveSection(sectionKey: string) {
    setSaving(true);
    try {
      const section = sections[sectionKey];
      if (!section) { setSaving(false); return; }

      // Detect linked_recipe_id column support
      let hasLinkedColumn = false;
      try {
        const { error: testErr } = await supabase
          .from('section_options')
          .select('linked_recipe_id')
          .limit(1);
        if (!testErr) hasLinkedColumn = true;
      } catch (e) {
        hasLinkedColumn = false;
      }

      // Detect sort_order support
      let useSortOrder = Boolean(hasSectionMetaSortOrder);
      if (hasSectionMetaSortOrder === null) {
        try {
          const { error: tErr } = await supabase
            .from('section_meta')
            .select('sort_order')
            .limit(1);
          useSortOrder = !tErr;
          setHasSectionMetaSortOrder(useSortOrder);
        } catch (e) {
          useSortOrder = false;
          setHasSectionMetaSortOrder(false);
        }
      }

      // Upsert section meta
      const label = keyToLabel[sectionKey] || section.name || sectionKey;
      const metaConflict = 'section';
      const baseMetaPayload: any = {
        section: sectionKey,
        description: section.description || '',
        required: Boolean(section.required),
        name: label,
        show_description: Boolean(section.showDescriptions),
        hide_price: Boolean(section.hidePrice),
        multiply_enabled: multiplyEnabled[sectionKey] ?? true,
        layout: sectionLayout[sectionKey] || 'list',
        ...(userBakeryId ? { bakery_id: userBakeryId } : {}),
      };
      if (useSortOrder) {
        const idx = sectionOrder && sectionOrder.length ? sectionOrder.indexOf(sectionKey) : -1;
        const metaPayloadWithOrder = { ...baseMetaPayload, sort_order: idx >= 0 ? idx : 0 };
        // Try upsert including hide_price; if DB doesn't support hide_price, retry without it
        const { error } = await supabase
          .from('section_meta')
          .upsert(metaPayloadWithOrder, { onConflict: metaConflict });
        if (error) {
          // Retry without hide_price first
          const payloadNoHide = { ...metaPayloadWithOrder };
          delete payloadNoHide.hide_price;
          const { error: errHide } = await supabase
            .from('section_meta')
            .upsert(payloadNoHide, { onConflict: metaConflict });
          if (!errHide) {
            // success without hide_price
          } else {
            // Fallback: try without name column (old DB)
            const payloadNoHideNoName = { ...payloadNoHide };
            delete payloadNoHideNoName.name;
            const fallbackPayload = useSortOrder ? { ...payloadNoHideNoName, sort_order: idx >= 0 ? idx : 0 } : payloadNoHideNoName;
            const { error: err2 } = await supabase
              .from('section_meta')
              .upsert(fallbackPayload, { onConflict: metaConflict });
            if (err2) {
              // Try without sort_order too
              const { error: err3 } = await supabase
                .from('section_meta')
                .upsert(baseMetaPayload, { onConflict: metaConflict });
              if (err3) throw err3;
              setHasSectionMetaSortOrder(false);
            }
          }
        }
      } else {
        // Try upsert including hide_price; fallback if DB doesn't have the column
        const { error } = await supabase
          .from('section_meta')
          .upsert(baseMetaPayload, { onConflict: metaConflict });
        if (error) {
          // Remove hide_price and try again
          const payloadNoHide = { ...baseMetaPayload };
          delete payloadNoHide.hide_price;
          const { error: err2 } = await supabase
            .from('section_meta')
            .upsert(payloadNoHide, { onConflict: metaConflict });
          if (err2) {
            // Fallback: try without name column
            delete payloadNoHide.name;
            const { error: err3 } = await supabase
              .from('section_meta')
              .upsert(payloadNoHide, { onConflict: metaConflict });
            if (err3) throw err3;
          }
        }
      }

      // Fetch existing options for remapping
      const { data: oldOptions = [], error: oldOptErr } = await supabase
        .from('section_options')
        .select('id, name')
        .eq('section', sectionKey);
      if (oldOptErr) throw oldOptErr;
      const oldOptMap: Record<string, string> = {};
      (oldOptions || []).forEach((o: any) => { if (o?.id) oldOptMap[o.id] = o.name; });

      let emQ = supabase.from('diameter_multipliers').select('id, option_id, base_option_id').eq('section_key', sectionKey);
      if (userBakeryId) emQ = (emQ as any).eq('bakery_id', userBakeryId);
      const { data: existingMultipliers = [], error: multErr } = await emQ;
      if (multErr) throw multErr;

      // Delete existing options
      let delOpQ = supabase.from('section_options').delete().eq('section', sectionKey);
      if (userBakeryId) delOpQ = (delOpQ as any).eq('bakery_id', userBakeryId);
      const { error: delErr } = await delOpQ;
      if (delErr) throw delErr;

      if (section.options.length) {
        const rows = section.options.map((opt, idx) => {
          const baseRow: any = {
            section: sectionKey,
            name: opt.name,
            price: Boolean(section.hidePrice) ? null : opt.price,
            description: opt.description || '',
            sort_order: idx,
            ...(userBakeryId ? { bakery_id: userBakeryId } : {}),
          };
          if (hasLinkedColumn && opt.linkedRecipeId) {
            baseRow.linked_recipe_id = opt.linkedRecipeId;
          }
          return baseRow;
        });

        const { data: newInserted = [], error: insErr } = await supabase
          .from('section_options')
          .insert(rows)
          .select('id, name');
        if (insErr) throw insErr;

        const newMap: Record<string, string> = {};
        (newInserted || []).forEach((n: any) => { if (n?.id) newMap[n.name] = n.id; });

        // Remap local state
        try {
          const oldNameToId: Record<string, string> = {};
          (oldOptions || []).forEach((o: any) => { if (o?.id && o?.name) oldNameToId[o.name] = o.id; });

          setDiameterMultipliersMap(prev => {
            const copy = { ...prev };
            Object.keys(newMap).forEach(name => {
              const oldId = oldNameToId[name];
              const newId = newMap[name];
              if (oldId && newId) {
                const oldKey = `${sectionKey}:${oldId}`;
                const newKey = `${sectionKey}:${newId}`;
                if (Object.prototype.hasOwnProperty.call(prev, oldKey)) {
                  copy[newKey] = prev[oldKey];
                  delete copy[oldKey];
                }
              }
            });
            return copy;
          });

          setBaseDiameterBySection(prev => {
            const curBase = prev[sectionKey];
            if (!curBase) return prev;
            const nameForOld = oldOptMap[curBase];
            if (nameForOld && newMap[nameForOld]) {
              return { ...prev, [sectionKey]: newMap[nameForOld] };
            }
            return prev;
          });
        } catch (e) {
          console.warn('Warning: remapping local multiplier ids failed', e);
        }

        setSections(prev => {
          const cur = prev[sectionKey];
          if (!cur) return prev;
          const updatedOptions = (cur.options || []).map((o: any) => ({ ...o, id: newMap[o.name] || o.id, price: Boolean(section.hidePrice) ? 0 : o.price }));
          return { ...prev, [sectionKey]: { ...cur, options: updatedOptions } };
        });

        // Recreate diameter multipliers if enabled
        try {
          if (Boolean(diameterEnabled[sectionKey])) {
            const baseFrontendId = baseDiameterBySection[sectionKey];
            let baseName: string | null = null;
            if (baseFrontendId) {
              const frontendOpt = section.options.find((o: any) => o.id === baseFrontendId);
              if (frontendOpt) baseName = frontendOpt.name;
            }
            if (!baseName && (existingMultipliers || []).length) {
              const maybe = (existingMultipliers || []).find((m: any) => m.base_option_id);
              if (maybe) {
                const oldBaseName = oldOptMap[maybe.base_option_id];
                if (oldBaseName) baseName = oldBaseName;
              }
            }
            const baseDbId = baseName ? newMap[baseName] : null;
            const entries = (section.options || []).map((o: any) => {
              const optDbId = newMap[o.name];
              if (!optDbId) return null;
              const optSize = parseFloat(o.name);
              const baseSize = baseName ? parseFloat(baseName) : NaN;
              const mult = (isNaN(optSize) || isNaN(baseSize)) ? 1.0 : Math.pow(optSize / baseSize, 2);
              return {
                section_key: sectionKey,
                base_option_id: baseDbId,
                option_id: optDbId,
                multiplier: Number(mult.toFixed(1)),
                ...(userBakeryId ? { bakery_id: userBakeryId } : {}),
              };
            }).filter(Boolean) as any[];
            if (entries.length) {
              const dmConflict = 'section_key,option_id';
              const { error: upsertErr } = await supabase
                .from('diameter_multipliers')
                .upsert(entries, { onConflict: dmConflict });
              if (upsertErr) console.warn('Warning: failed to upsert diameter multipliers', upsertErr);
            }
          }
        } catch (e) {
          console.warn('Warning: failed to recreate multipliers for section', sectionKey, e);
        }
      }

      // Reload diameter multipliers for this section
      try {
        if (Boolean(diameterEnabled[sectionKey])) {
          await loadDiameterMultipliers(sectionKey, userBakeryId);
        }
      } catch (e) {
        console.warn('Warning: failed to reload diameter multipliers', e);
      }

      // Exit edit mode, clear backup
      setEditingSectionKeys(prev => { const n = new Set(prev); n.delete(sectionKey); return n; });
      setSectionsBackup(prev => { const n = { ...prev }; delete n[sectionKey]; return n; });

    } catch (err) {
      console.error('❌ Chyba pri ukladaní sekcie:', err);
      const msg = err instanceof Error ? err.message : (err as any)?.message || (err as any)?.details || 'Neznáma chyba';
      alert(`❌ Chyba pri ukladaní: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Načítavam...</div>;
  }

  if (isPasswordRecovery) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#edeaea' }}>
        <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '2.5rem', minWidth: 380, maxWidth: 420, width: '100%' }}>
          <h1 style={{ textAlign: 'center', color: '#ff9fc4', fontWeight: 700, fontSize: '2rem', marginBottom: '0.5rem' }}>Nové heslo</h1>
          {resetSuccess ? (
            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
              <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: '1.5rem' }}>Heslo bolo úspešne zmenené!</p>
              <button
                onClick={() => { setIsPasswordRecovery(false); setResetSuccess(false); }}
                style={{ padding: '0.75rem 1.5rem', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', width: '100%' }}
              >
                Prihlásiť sa
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontWeight: 500, color: '#6c757d', fontSize: '0.95rem' }}>Nové heslo</label>
                <input
                  type="password"
                  placeholder="Minimálne 6 znakov"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoFocus
                  style={{ padding: '0.75rem 1rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '1rem', outline: 'none', fontFamily: 'inherit' }}
                />
              </div>
              {resetError && <div style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center' }}>{resetError}</div>}
              <button
                type="submit"
                disabled={resetLoading}
                style={{ padding: '0.85rem', background: resetLoading ? '#e5e7eb' : '#22c55e', color: resetLoading ? '#9ca3af' : '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '1.05rem', cursor: resetLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {resetLoading ? 'Ukladám...' : 'Nastaviť heslo'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    // Enhanced login panel
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#edeaea' }}>
        <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '2.5rem 2.5rem', minWidth: 380, maxWidth: 420, width: '100%' }}>
          <h1 style={{ textAlign: 'center', color: '#ff9fc4', fontWeight: 700, fontSize: '2.2rem', marginBottom: '0.5rem', fontFamily: "'Dancing Script', cursive" }}>Admin Panel</h1>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="login-email" style={{ fontWeight: 500, color: '#6c757d', fontSize: '0.95rem' }}>Email</label>
              <input
                  id="login-email"
                  name="email"
                  autoComplete="email"
                  type="email"
                  placeholder="Email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  style={{
                    padding: '0.9rem 1rem',
                    borderRadius: '8px',
                    border: '1.5px solid #e0e6f0',
                    fontSize: '1rem',
                    background: '#f7f7f7',
                    color: '#333',
                    fontWeight: 500,
                    outline: 'none',
                    marginBottom: 0,
                  }}
                />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
              <label htmlFor="login-password" style={{ fontWeight: 500, color: '#6c757d', fontSize: '0.95rem' }}>Heslo</label>
              <input
                id="login-password"
                name="current-password"
                autoComplete="current-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Heslo"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                style={{
                  padding: '0.9rem 1rem',
                  borderRadius: '8px',
                  border: '1.5px solid #e0e6f0',
                  fontSize: '1rem',
                  background: '#f7f7f7',
                  color: '#333',
                  fontWeight: 500,
                  outline: 'none',
                  marginBottom: 0,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 38,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  color: showPassword ? '#ff9fc4' : '#aaa',
                }}
                tabIndex={-1}
                aria-label={showPassword ? 'Skryť heslo' : 'Zobraziť heslo'}
              >
                {showPassword ? '👁️' : '👁'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                id="remember-me"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#ff9fc4', marginRight: 4 }}
              />
              <label htmlFor="remember-me" style={{ color: '#6c757d', fontSize: '0.95rem', fontWeight: 500 }}>Zapamätať prihlásenie</label>
            </div>
            {loginError && <p style={{ color: '#dc3545', fontSize: '0.95rem', margin: 0 }}>{loginError}</p>}
            <button type="submit" disabled={loginLoading} style={{
              padding: '0.9rem 1.2rem',
              background: loginLoading ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '1.1rem',
              cursor: loginLoading ? 'wait' : 'pointer',
              marginBottom: '0.5rem',
              boxShadow: '0 2px 10px rgba(124,58,237,0.25)',
              transition: 'opacity 0.2s',
            }}>
              {loginLoading ? 'Prihlásujem...' : 'Prihlásiť sa'}
            </button>
          </form>
          <div style={{ display: 'flex', alignItems: 'center', margin: '1.2rem 0 0.7rem 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e0e6f0' }} />
            <span style={{ color: '#aaa', fontSize: '0.95rem', fontWeight: 500, margin: '0 0.7rem' }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#e0e6f0' }} />
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.7rem',
              background: '#fff',
              border: '1.5px solid #e0e6f0',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '1.05rem',
              color: '#333',
              padding: '0.9rem 1.2rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
              marginBottom: '0.5rem',
              transition: 'background 0.2s',
              width: '100%'
            }}
          >
            <span style={{ marginRight: '0.6rem', fontSize: '1.05rem' }}>←</span>
            Go back to calculator
          </button>
          {/* Back button removed per request */}
        </div>
      </div>
    );
  }

  if (userRole === 'super_admin') {
    return <SuperAdminPanel user={user} onLogout={handleLogout} />;
  }

  return (
    <>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.title}>Admin Panel</h1>
          <div style={styles.headerRight}>
            <button onClick={handleLogout} style={styles.logoutButton}>
              Odhlásiť
            </button>
          </div>
        </div>
      </header>

      {/* Tabs Navigation (centered and attached to content) */}
      <div style={styles.tabBar}>
        <button
          onClick={() => setActiveTab('UI')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'UI' ? {
              ...styles.tabButtonActive,
              backgroundColor: tabColors.UI.primary,
              borderBottom: `4px solid ${tabColors.UI.secondary}`,
              color: tabColors.UI.text,
            } : {}),
          }}
        >
          UI
        </button>
        <button
          onClick={() => setActiveTab('Recepty')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'Recepty' ? {
              ...styles.tabButtonActive,
              backgroundColor: tabColors.Recepty.primary,
              borderBottom: `4px solid ${tabColors.Recepty.secondary}`,
              color: tabColors.Recepty.text,
            } : {}),
          }}
        >
          Recepty
        </button>
        <button
          onClick={() => setActiveTab('Ingrediencie')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'Ingrediencie' ? {
              ...styles.tabButtonActive,
              backgroundColor: tabColors.Ingrediencie.primary,
              borderBottom: `4px solid ${tabColors.Ingrediencie.secondary}`,
              color: tabColors.Ingrediencie.text,
            } : {}),
          }}
        >
          Ingrediencie
        </button>
        <button
          onClick={() => setActiveTab('Profil')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'Profil' ? {
              ...styles.tabButtonActive,
              backgroundColor: tabColors.Profil.primary,
              borderBottom: `4px solid ${tabColors.Profil.secondary}`,
              color: tabColors.Profil.text,
            } : {}),
          }}
        >
          Profil
        </button>
      </div>

      <div style={{
        ...styles.content,
        backgroundColor: currentColors.primary,
        padding: '2rem',
        borderRadius: '12px',
        marginTop: '0',
        boxShadow: `0 4px 12px ${currentColors.secondary}30`,
      }}>
        {/* Tab Content: UI */}
        {activeTab === 'UI' && (
          <section style={{
            ...styles.section,
            backgroundColor: '#fff',
            border: `2px solid ${currentColors.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ ...styles.sectionTitle, color: currentColors.text, margin: 0 }}>User Interface</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {reorderMode ? (
                  <>
                    <button
                      onClick={saveReorder}
                      disabled={saving}
                      style={{
                        ...styles.addButton,
                        backgroundColor: currentColors.secondary,
                        color: '#fff',
                        padding: '0.75rem 1.5rem',
                        fontSize: '1rem',
                        cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saving ? 'Ukladám...' : '💾 Uložiť poradie'}
                    </button>
                    <button
                      onClick={() => {
                        setSectionOrder(reorderBackup);
                        setReorderMode(false);
                        setReorderBackup([]);
                      }}
                      style={{
                        ...styles.addButton,
                        backgroundColor: '#95a5a6',
                        color: '#fff',
                        padding: '0.75rem 1.5rem',
                        fontSize: '1rem',
                      }}
                    >
                      Zrušiť
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setReorderBackup([...sectionOrder]);
                        setReorderMode(true);
                      }}
                      style={{
                        ...styles.addButton,
                        backgroundColor: currentColors.secondary,
                        color: '#fff',
                        padding: '0.75rem 1.5rem',
                        fontSize: '1rem',
                      }}
                    >
                      Zmeniť poradie
                    </button>
                    <button
                      onClick={() => { setNewSectionName(''); setShowNewSectionModal(true); }}
                      style={{
                        ...styles.addButton,
                        backgroundColor: currentColors.secondary,
                        color: '#fff',
                        padding: '0.75rem 1.5rem',
                        fontSize: '1rem',
                      }}
                    >
                      + Pridať sekciu
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Dynamically render all sections */}
          {(sectionOrder && sectionOrder.length ? sectionOrder : Object.keys(sections))
            .filter((sectionKey) => sections[sectionKey])
            .map((sectionKey) => {
              const section = sections[sectionKey];
              const label = keyToLabel[sectionKey] || sectionKey;
              const isSectionEditing = editingSectionKeys.has(sectionKey);
              return (
                <section
                  key={sectionKey}
                  data-section-key={sectionKey}
                  ref={(el) => setSectionRef(sectionKey, el)}
                  draggable={false}
                  onDragOver={(e) => reorderMode && onDragOverSection(e)}
                  onDrop={reorderMode ? onDropSection : undefined}
                  onDragEnd={reorderMode ? onDragEndSection : undefined}
                  onPointerDown={reorderMode ? (e) => onPointerDownSection(e, sectionKey) : undefined}
                  style={{
                    ...styles.section,
                    backgroundColor: isSectionEditing ? '#fffcf0' : '#fafafa',
                    border: isSectionEditing ? `2px solid ${currentColors.secondary}` : `1px solid ${currentColors.border}`,
                    willChange: 'transform',
                    transition: 'all 0.2s ease',
                  }}
                >
                <div style={styles.sectionHeader}>
                  {/* Left group: title/description */}
                  <div style={{ flex: 1, marginRight: '1rem' }}>
                      {isSectionEditing ? (
                        <>
                          <input
                            type="text"
                            defaultValue={label}
                            key={`title-${sectionKey}-${isSectionEditing}`}
                            onBlur={(e) => {
                              const newLabel = e.target.value;
                              if (newLabel && newLabel.trim() && newLabel.trim() !== label) {
                                renameSection(sectionKey, newLabel.trim());
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '0.6rem 0.75rem',
                              fontSize: '1.2rem',
                              fontWeight: 'bold',
                              border: `2px solid ${currentColors.border}`,
                              borderRadius: '6px',
                              marginBottom: '0.5rem',
                              boxSizing: 'border-box' as const,
                              color: currentColors.text,
                              backgroundColor: '#fff',
                              outline: 'none',
                            }}
                          />
                          <textarea
                            value={section.description || ''}
                            rows={1}
                            ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                            onChange={(e) => { updateSectionDescription(sectionKey, e.target.value); }}
                            onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                            placeholder="Popis sekcie"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.9rem',
                              border: `2px solid ${currentColors.border}`,
                              borderRadius: '6px',
                              resize: 'none',
                              fontStyle: 'italic',
                              color: '#333',
                              WebkitTextFillColor: '#333',
                              backgroundColor: '#ffffff',
                              boxSizing: 'border-box' as const,
                              outline: 'none',
                              fontFamily: 'inherit',
                              overflow: 'hidden',
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <h3 style={{ margin: '0 0 0.5rem 0', color: currentColors.text, fontSize: '1.2rem' }}>
                            {label}
                          </h3>
                          <p style={{ margin: 0, color: '#666', fontSize: '0.9rem', fontStyle: 'italic' }}>
                            {section.description || ''}
                          </p>
                        </>
                      )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0, alignSelf: 'flex-start', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {isSectionEditing ? (
                      <>
                        <button
                          onClick={() => handleSaveSection(sectionKey)}
                          disabled={saving}
                          style={{
                            background: currentColors.secondary,
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.5rem 1rem',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            minWidth: '90px',
                            textAlign: 'center' as const,
                          }}
                        >
                          {saving ? 'Ukladám...' : '💾 Uložiť'}
                        </button>
                        <button
                          onClick={() => {
                            // Restore from backup
                            setSections(prev => ({ ...prev, [sectionKey]: JSON.parse(JSON.stringify(sectionsBackup[sectionKey])) }));
                            setEditingSectionKeys(prev => { const n = new Set(prev); n.delete(sectionKey); return n; });
                            setSectionsBackup(prev => { const n = { ...prev }; delete n[sectionKey]; return n; });
                          }}
                          style={{
                            background: '#95a5a6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            minWidth: '80px',
                            textAlign: 'center' as const,
                          }}
                        >
                          Zrušiť
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setSectionsBackup(prev => ({ ...prev, [sectionKey]: JSON.parse(JSON.stringify(section)) }));
                            setEditingSectionKeys(prev => { const n = new Set(prev); n.add(sectionKey); return n; });
                          }}
                          style={{
                            background: currentColors.secondary,
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            minWidth: '90px',
                            textAlign: 'center' as const,
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => removeSection(sectionKey)}
                          style={{
                            background: '#e74c3c',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            minWidth: '80px',
                            textAlign: 'center' as const,
                          }}
                        >
                          Zmazať
                        </button>
                      </>
                    )}
                    </div>
                    {/* Layout toggle */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#bbb', letterSpacing: '0.06em', textTransform: 'uppercase', userSelect: 'none' }}>rozloženie</span>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        {/* Button 1: list/dropdown layout */}
                        <button
                          onClick={isSectionEditing ? () => setSectionLayout(prev => ({ ...prev, [sectionKey]: 'list' })) : undefined}
                          title="Dropdown rozloženie"
                          style={{
                            width: 30, height: 30,
                            background: sectionLayout[sectionKey] !== 'grid' ? currentColors.secondary : '#ececec',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isSectionEditing ? 'pointer' : 'default',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                            padding: 0,
                            outline: 'none',
                            boxShadow: sectionLayout[sectionKey] !== 'grid' ? `0 2px 6px ${currentColors.secondary}55` : 'none',
                            opacity: isSectionEditing ? 1 : 0.7,
                            transition: 'background 0.15s, box-shadow 0.15s',
                          }}
                        >
                          {[0,1,2].map(i => (
                            <span key={i} style={{ display: 'block', width: 13, height: 2, background: sectionLayout[sectionKey] !== 'grid' ? '#fff' : '#aaa', borderRadius: 2 }} />
                          ))}
                        </button>
                        {/* Button 2: grid layout (no effect yet) */}
                        <button
                          onClick={isSectionEditing ? () => setSectionLayout(prev => ({ ...prev, [sectionKey]: 'grid' })) : undefined}
                          title="Grid rozloženie"
                          style={{
                            width: 30, height: 30,
                            background: sectionLayout[sectionKey] === 'grid' ? currentColors.secondary : '#ececec',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isSectionEditing ? 'pointer' : 'default',
                            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', alignItems: 'center', justifyItems: 'center',
                            gap: '2px',
                            padding: '7px 6px',
                            outline: 'none',
                            boxShadow: sectionLayout[sectionKey] === 'grid' ? `0 2px 6px ${currentColors.secondary}55` : 'none',
                            opacity: isSectionEditing ? 1 : 0.7,
                            transition: 'background 0.15s, box-shadow 0.15s',
                          }}
                        >
                          {[0,1,2,3,4,5].map(i => (
                            <span key={i} style={{ display: 'block', width: 5, height: 5, background: sectionLayout[sectionKey] === 'grid' ? '#fff' : '#aaa', borderRadius: '1px' }} />
                          ))}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={styles.optionsContainer}>
                  {section.options.map((opt, idx) => {
                    const linkedRecipe = opt.linkedRecipeId ? recipes.find(r => r.id === opt.linkedRecipeId) : null;
                    const dropdownKey = `${sectionKey}-${idx}`;
                    const isDropdownOpen = sectionOptionDropdownOpen[dropdownKey] || false;
                    return (
                      <div key={idx} style={styles.optionBox}>
                        <div style={styles.optionRow}>
                        <div style={{ position: 'relative', flex: 2, minWidth: '120px', display: 'flex', alignItems: 'center' }} data-dropdown-container>
                          <input
                            type="text"
                            placeholder="Názov"
                            value={opt.name}
                            onChange={e => {
                              if (!isSectionEditing) return;
                              updateOption(sectionKey, idx, 'name', e.target.value);
                              if (opt.linkedRecipeId) {
                                updateOption(sectionKey, idx, 'linkedRecipeId', null);
                              }
                            }}
                            readOnly={!isSectionEditing}
                            style={{ ...styles.inputField, width: '100%', paddingRight: 36 }}
                            onFocus={() => {
                              if (opt.linkedRecipeId) {
                                setSectionOptionDropdownOpen(prev => ({ ...prev, [dropdownKey]: false }));
                              }
                            }}
                          />
                          {isSectionEditing && (
                          <button
                            type="button"
                            style={{
                              position: 'absolute',
                              right: 8,
                              width: '24px',
                              height: '24px',
                              background: currentColors.secondary,
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              fontSize: '10px',
                              color: '#fff',
                              fontWeight: 'bold',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onClick={() => setSectionOptionDropdownOpen(prev => {
                              if (prev[dropdownKey]) {
                                return { ...prev, [dropdownKey]: false };
                              } else {
                                return { [dropdownKey]: true };
                              }
                            })}
                          >
                            ▼
                          </button>
                          )}
                          {/* Dropdown menu */}
                          {isDropdownOpen && (
                            <div style={{
                              position: 'absolute',
                              top: '110%',
                              left: 0,
                              zIndex: 10,
                              background: '#fff',
                              border: `1px solid ${currentColors.border}`,
                              borderRadius: 8,
                              boxShadow: '0 8px 24px #0001',
                              minWidth: '200px',
                              padding: '0.25rem 0',
                              maxHeight: '200px',
                              overflowY: 'auto' as const,
                            }}>
                              {recipes.map(r => (
                                <div
                                  key={r.id}
                                  style={{ 
                                    padding: '0.5rem 1rem', 
                                    cursor: 'pointer', 
                                    color: '#000', 
                                    fontWeight: '500',
                                    background: opt.linkedRecipeId === r.id ? '#f0f0f0' : 'transparent',
                                    transition: 'background-color 0.2s ease'
                                  }}
                                  onClick={() => {
                                    updateOption(sectionKey, idx, 'linkedRecipeId', r.id);
                                    updateOption(sectionKey, idx, 'name', r.name);
                                    updateOption(sectionKey, idx, 'price', getRecipeTotalPrice(r.id));
                                    setSectionOptionDropdownOpen(prev => ({ ...prev, [dropdownKey]: false }));
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = currentColors.primary;
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = opt.linkedRecipeId === r.id ? '#f0f0f0' : 'transparent';
                                  }}
                                >
                                  {r.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {!section.hidePrice ? (
                        <div style={{ position: 'relative', flex: '0 0 auto', width: '90px', overflow: 'hidden', borderRadius: '8px' }}>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Cena"
                            value={linkedRecipe ? getRecipeTotalPrice(linkedRecipe.id) : (opt.price === 0 && opt._priceRaw === '' ? '' : opt._priceRaw ?? opt.price)}
                            onChange={e => {
                              if (!isSectionEditing) return;
                              updateOption(sectionKey, idx, '_priceRaw' as any, e.target.value);
                              if (e.target.value !== '') updateOption(sectionKey, idx, 'price', parseFloat(e.target.value) || 0);
                            }}
                            onBlur={e => {
                              if (!isSectionEditing) return;
                              const val = parseFloat(e.target.value) || 0;
                              updateOption(sectionKey, idx, 'price', val);
                              updateOption(sectionKey, idx, '_priceRaw' as any, undefined);
                            }}
                            readOnly={!isSectionEditing || !!linkedRecipe}
                            style={{ 
                              ...styles.inputField, 
                              width: '100%',
                              minWidth: '0',
                              padding: (linkedRecipe || !isSectionEditing) ? '0.7rem' : '0.7rem 26px 0.7rem 0.8rem',
                              boxSizing: 'border-box',
                              margin: 0,
                              boxShadow: '0 1px 4px #ffb3d122',
                            }}
                          />
                          {isSectionEditing && (
                          <div style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            display: linkedRecipe ? 'none' : 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}>
                            <button
                              type="button"
                              onClick={() => {
                                const current = linkedRecipe ? getRecipeTotalPrice(linkedRecipe.id) : opt.price;
                                updateOption(sectionKey, idx, 'price', current + 0.01);
                              }}
                              disabled={!!linkedRecipe}
                              style={{
                                width: '18px',
                                height: '13px',
                                border: 'none',
                                background: linkedRecipe ? '#ddd' : currentColors.secondary,
                                borderRadius: '2px',
                                cursor: linkedRecipe ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '9px',
                                color: '#fff',
                                fontWeight: 'bold',
                                padding: 0,
                              }}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const current = linkedRecipe ? getRecipeTotalPrice(linkedRecipe.id) : opt.price;
                                if (current > 0) {
                                  updateOption(sectionKey, idx, 'price', Math.max(0, current - 0.01));
                                }
                              }}
                              disabled={!!linkedRecipe}
                              style={{
                                width: '18px',
                                height: '13px',
                                border: 'none',
                                background: linkedRecipe ? '#ddd' : currentColors.secondary,
                                borderRadius: '2px',
                                cursor: linkedRecipe ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '9px',
                                color: '#fff',
                                fontWeight: 'bold',
                                padding: 0,
                              }}
                            >
                              ▼
                            </button>
                          </div>
                          )}
                        </div>
                        ) : (
                          <div style={{ width: 0, marginRight: 12 }} />
                        )}

                        {/* Small multiplier pill: click pill to edit, click row to set base */}
                        {diameterEnabled[sectionKey] && opt.id && (
                          <div
                            onClick={() => {
                              if (!isSectionEditing) return;
                              // Only update local UI state and multipliers; persist on Save
                              try {
                                setBaseDiameterBySection(prev => ({ ...prev, [sectionKey]: opt.id! }));
                                // compute local multipliers based on area scaling so UI updates immediately
                                const baseSize = parseFloat(opt.name);
                                const newMap: Record<string, number> = {};
                                (section.options || []).forEach(o => {
                                  const optSize = parseFloat(o.name);
                                  const mult = (isNaN(optSize) || isNaN(baseSize)) ? 1.0 : Math.pow(optSize / baseSize, 2);
                                  newMap[`${sectionKey}:${o.id}`] = Number(mult.toFixed(1));
                                });
                                setDiameterMultipliersMap(prev => ({ ...prev, ...newMap }));
                              } catch (e) {
                                console.error('Local set base failed:', e);
                                alert('Nepodarilo sa lokálne nastaviť základný priemer');
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '8px',
                              marginLeft: '12px',
                              minWidth: 0,
                            }}
                            title={baseDiameterBySection[sectionKey] === opt.id ? 'Základný priemer' : 'Klikni pre nastavenie základného priemeru'}
                          >
                            

                            {/* multiplier pill: small fixed-width; click pill to edit (stopPropagation) */}
                            {editingMultiplierKey === `${sectionKey}:${opt.id}` ? (
                              <input
                                autoFocus
                                onClick={e => e.stopPropagation()}
                                onFocus={e => (e.target as HTMLInputElement).select()}
                                type="number"
                                step="0.1"
                                defaultValue={(diameterMultipliersMap[`${sectionKey}:${opt.id}`] ?? 1).toFixed(1)}
                                onBlur={async (e) => {
                                  const v = parseFloat((e.target as HTMLInputElement).value) || 1;
                                  await updateMultiplier(sectionKey, opt.id!, v);
                                  setEditingMultiplierKey(null);
                                }}
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter') {
                                    const v = parseFloat((e.target as HTMLInputElement).value) || 1;
                                    await updateMultiplier(sectionKey, opt.id!, v);
                                    setEditingMultiplierKey(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingMultiplierKey(null);
                                  }
                                }}
                                style={{
                                  width: 64,
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  border: '1px solid ' + currentColors.border,
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  background: '#fff'
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  background: baseDiameterBySection[sectionKey] === opt.id ? currentColors.secondary : '#fff',
                                  color: baseDiameterBySection[sectionKey] === opt.id ? '#fff' : '#333',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  width: 64,
                                  textAlign: 'center',
                                  boxShadow: baseDiameterBySection[sectionKey] === opt.id ? `0 6px 18px ${currentColors.secondary}30` : 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title={isSectionEditing ? 'Klikni pre nastavenie základu alebo klikni na číslo pre edit' : ''}
                                onPointerDown={(e) => { e.stopPropagation(); }}
                              >
                                <span
                                  onPointerDown={(e) => { e.stopPropagation(); }}
                                  onClick={(e) => { e.stopPropagation(); if (isSectionEditing) setEditingMultiplierKey(`${sectionKey}:${opt.id}`); }}
                                  style={{ display: 'inline-block' }}
                                  className="upec-no-drag"
                                >
                                  {(diameterMultipliersMap[`${sectionKey}:${opt.id}`] ?? 1).toFixed(1)}x
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                          <button
                            onClick={() => isSectionEditing && removeOption(sectionKey, idx)}
                            disabled={!isSectionEditing}
                            style={{
                              ...styles.removeButton,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        {/* Option description input - shown when showDescriptions is enabled */}
                        {section.showDescriptions && (
                          <textarea
                            placeholder="Popis možnosti"
                            value={opt.description || ''}
                            rows={1}
                            ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                            onChange={e => {
                              if (!isSectionEditing) return;
                              updateOption(sectionKey, idx, 'description', e.target.value);
                            }}
                            onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                            readOnly={!isSectionEditing}
                            style={{
                              width: '100%',
                              boxSizing: 'border-box' as const,
                              marginTop: '0.35rem',
                              fontSize: '0.85rem',
                              padding: '0.55rem 0.75rem',
                              borderRadius: '8px',
                              border: '1.5px solid #ffb3d1',
                              background: '#ffffff',
                              backgroundColor: '#ffffff',
                              color: '#1a1a1a',
                              WebkitTextFillColor: '#1a1a1a',
                              fontFamily: 'inherit',
                              fontWeight: '500',
                              resize: 'none' as const,
                              outline: 'none',
                              overflow: 'hidden',
                            }}
                          />
                        )}
                      </div>
                    );
                    })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  onClick={() => isSectionEditing && addOption(sectionKey)}
                  disabled={!isSectionEditing}
                  style={{
                    ...styles.addButton,
                  }}
                >
                  + Pridať možnosť
                </button>
                {/* Section settings dropdown */}
                <div style={{ position: 'relative' }} data-section-settings-dropdown>
                  <button
                    onClick={(e) => {
                      const menu = e.currentTarget.nextElementSibling as HTMLElement;
                      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                    }}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: '6px',
                      border: `1.5px solid ${currentColors.border}`,
                      fontSize: '0.85rem',
                      color: currentColors.text,
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      outline: 'none',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Nastavenia ▾
                  </button>
                  <div data-section-settings-menu style={{
                    display: 'none',
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    marginBottom: '4px',
                    backgroundColor: '#fff',
                    border: `1.5px solid ${currentColors.border}`,
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 10,
                    overflow: 'hidden',
                    minWidth: '200px',
                  }}>
                    {/* Option 1: povinné pole */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.55rem 0.75rem',
                        cursor: isSectionEditing ? 'pointer' : 'default',
                        fontSize: '0.85rem',
                        color: currentColors.text,
                        borderBottom: `1px solid ${currentColors.border}`,
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentColors.primary}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      povinné pole
                      <input
                        type="checkbox"
                        checked={Boolean(section.required)}
                        onChange={isSectionEditing ? (e) => setSections(prev => ({
                          ...prev,
                          [sectionKey]: { ...prev[sectionKey], required: e.target.checked }
                        })) : undefined}
                        readOnly={!isSectionEditing}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: isSectionEditing ? 'pointer' : 'default',
                          accentColor: currentColors.secondary,
                          flexShrink: 0,
                          pointerEvents: isSectionEditing ? 'auto' : 'none',
                        }}
                      />
                    </label>
                    {/* Option 3: zrušiť cenu */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.55rem 0.75rem',
                        cursor: isSectionEditing ? 'pointer' : 'default',
                        fontSize: '0.85rem',
                        color: currentColors.text,
                        borderBottom: `1px solid ${currentColors.border}`,
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentColors.primary}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      zrušiť cenu
                      <input
                        type="checkbox"
                        checked={Boolean(section.hidePrice)}
                        onChange={isSectionEditing ? (e) => setSections(prev => ({
                          ...prev,
                          [sectionKey]: { ...prev[sectionKey], hidePrice: e.target.checked }
                        })) : undefined}
                        readOnly={!isSectionEditing}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: isSectionEditing ? 'pointer' : 'default',
                          accentColor: currentColors.secondary,
                          flexShrink: 0,
                          pointerEvents: isSectionEditing ? 'auto' : 'none',
                        }}
                      />
                    </label>
                    {/* Option 2: popis možností (noop for now) */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.55rem 0.75rem',
                        cursor: isSectionEditing ? 'pointer' : 'default',
                        fontSize: '0.85rem',
                        color: currentColors.text,
                        borderBottom: `1px solid ${currentColors.border}`,
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentColors.primary}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      popis možností
                      <input
                        type="checkbox"
                        checked={Boolean(section.showDescriptions)}
                        onChange={isSectionEditing ? (e) => setSections(prev => ({
                          ...prev,
                          [sectionKey]: { ...prev[sectionKey], showDescriptions: e.target.checked }
                        })) : undefined}
                        readOnly={!isSectionEditing}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: isSectionEditing ? 'pointer' : 'default',
                          accentColor: currentColors.secondary,
                          flexShrink: 0,
                          pointerEvents: isSectionEditing ? 'auto' : 'none',
                        }}
                      />
                    </label>
                    {/* Option 4: nastaviť násobky (len pre sekciu čo definuje násobky, alebo keď žiadna sekcia nemá násobky) alebo násobenie aktívne (pre ostatné keď už nejaká sekcia definuje násobky) */}
                    {diameterEnabled[sectionKey] || !Object.values(diameterEnabled).some(Boolean) ? (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.55rem 0.75rem',
                        cursor: isSectionEditing ? 'pointer' : 'default',
                        fontSize: '0.85rem',
                        color: currentColors.text,
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentColors.primary}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      nastaviť násobky
                      <input
                        type="checkbox"
                        checked={Boolean(diameterEnabled[sectionKey])}
                        onChange={isSectionEditing ? async (e) => {
                          const enable = e.target.checked;
                          await toggleDiameterSection(sectionKey, enable, section.options || []);
                        } : undefined}
                        readOnly={!isSectionEditing}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: isSectionEditing ? 'pointer' : 'default',
                          accentColor: currentColors.secondary,
                          flexShrink: 0,
                          pointerEvents: isSectionEditing ? 'auto' : 'none',
                        }}
                      />
                    </label>
                    ) : (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.55rem 0.75rem',
                        cursor: isSectionEditing ? 'pointer' : 'default',
                        fontSize: '0.85rem',
                        color: currentColors.text,
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentColors.primary}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      násobenie aktívne
                      <input
                        type="checkbox"
                        checked={multiplyEnabled[sectionKey] ?? true}
                        onChange={isSectionEditing ? (e) => setMultiplyEnabledForSection(sectionKey, e.target.checked) : undefined}
                        readOnly={!isSectionEditing}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: isSectionEditing ? 'pointer' : 'default',
                          accentColor: currentColors.secondary,
                          flexShrink: 0,
                          pointerEvents: isSectionEditing ? 'auto' : 'none',
                        }}
                      />
                    </label>
                    )}
                  </div>
                </div>
                </div>
              </section>
            );
          })}
          
          {/* Button to add new section */}
          </div>
          </section>
        )}

        {/* Tab Content: Recepty */}
        {activeTab === 'Recepty' && (
          <section style={{
            ...styles.section,
            backgroundColor: '#fff',
            border: `2px solid ${currentColors.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ ...styles.sectionTitle, color: currentColors.text, margin: 0 }}>Recepty</h2>
              <button
                onClick={() => {
                  const recipeName = prompt('Zadajte názov receptu:');
                  if (recipeName && recipeName.trim()) {
                    const description = prompt('Zadajte popis receptu:');
                    addNewRecipe(recipeName.trim(), description?.trim() || '');
                  }
                }}
                style={{
                  ...styles.addButton,
                  backgroundColor: currentColors.secondary,
                  color: '#fff',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                }}
              >
                + Nový recept
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {recipes.map((recipe) => {
                const isEditing = editingRecipeId === recipe.id;
                return (
                <div
                  key={recipe.id}
                  style={{
                    backgroundColor: '#fff',
                    border: isEditing ? `2px solid ${currentColors.secondary}` : `1.5px solid ${currentColors.border}`,
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: isEditing
                      ? `0 0 0 3px ${currentColors.secondary}25, 0 4px 20px ${currentColors.secondary}20`
                      : '0 2px 12px rgba(0,0,0,0.07)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem', padding: '1.25rem 1.25rem 0 1.25rem' }}>
                    <div style={{ flex: 1, marginRight: '1rem' }}>
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            value={editDraft.name}
                            onChange={(e) => setEditDraft(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Názov receptu"
                            style={{
                              width: '100%',
                              padding: '0.6rem 0.75rem',
                              fontSize: '1.2rem',
                              fontWeight: 'bold',
                              border: `2px solid ${currentColors.border}`,
                              borderRadius: '6px',
                              marginBottom: '0.5rem',
                              boxSizing: 'border-box',
                              color: currentColors.text,
                              backgroundColor: '#fff',
                              outline: 'none',
                            }}
                          />
                          <textarea
                            value={editDraft.description}
                            rows={1}
                            ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                            onChange={(e) => setEditDraft(prev => ({ ...prev, description: e.target.value }))}
                            onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                            placeholder="Popis receptu"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.9rem',
                              border: `2px solid ${currentColors.border}`,
                              borderRadius: '6px',
                              resize: 'none',
                              fontStyle: 'italic',
                              color: '#333',
                              WebkitTextFillColor: '#333',
                              backgroundColor: '#ffffff',
                              boxSizing: 'border-box',
                              outline: 'none',
                              fontFamily: 'inherit',
                              overflow: 'hidden',
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <h3 style={{ margin: '0 0 0.3rem 0', color: currentColors.text, fontSize: '1.2rem', fontWeight: 700 }}>
                            {recipe.name}
                          </h3>
                          <p style={{ margin: 0, color: '#888', fontSize: '0.9rem', fontStyle: 'italic' }}>
                            {recipe.description}
                          </p>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignSelf: 'flex-start' }}>
                      {isEditing ? (
                        <>
                          <button
                            onClick={saveRecipeEdits}
                            disabled={savingRecipe}
                            style={{
                              background: savingRecipe ? '#a7f3d0' : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '10px',
                              padding: '0.5rem 1.1rem',
                              cursor: savingRecipe ? 'wait' : 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              opacity: savingRecipe ? 0.7 : 1,
                              minWidth: '90px',
                              textAlign: 'center' as const,
                              boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                            }}
                          >
                            {savingRecipe ? 'Ukladám...' : '💾 Uložiť'}
                          </button>
                          <button
                            onClick={cancelEditRecipe}
                            style={{
                              background: '#f1f5f9',
                              color: '#64748b',
                              border: '1.5px solid #e2e8f0',
                              borderRadius: '10px',
                              padding: '0.5rem 1.1rem',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              minWidth: '80px',
                              textAlign: 'center' as const,
                            }}
                          >
                            Zrušiť
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEditRecipe(recipe)}
                            style={{
                              background: `linear-gradient(135deg, ${currentColors.secondary} 0%, ${currentColors.secondary}cc 100%)`,
                              color: '#fff',
                              border: 'none',
                              borderRadius: '10px',
                              padding: '0.5rem 1.1rem',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              minWidth: '90px',
                              textAlign: 'center' as const,
                              boxShadow: `0 2px 8px ${currentColors.secondary}40`,
                            }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => deleteRecipe(recipe.id)}
                            style={{
                              background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '10px',
                              padding: '0.5rem 1.1rem',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              minWidth: '80px',
                              textAlign: 'center' as const,
                              boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
                            }}
                          >
                            Zmazať
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem', padding: '0 1.25rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: currentColors.secondary, fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      Suroviny:
                    </h4>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      {recipeIngredientsByRecipe[recipe.id]?.map((ri) => {
                        const editQty = isEditing ? (editDraft.ingredients[ri.id] ?? ri.quantity) : ri.quantity;
                        const displayCost = isEditing ? getIngredientCostWithQty(ri, editQty) : getIngredientCostWithQty(ri);
                        return (
                        <div
                          key={ri.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 110px 160px 75px 28px',
                            alignItems: 'center',
                            gap: '0.5rem',
                            backgroundColor: isEditing ? currentColors.primary : '#f8f9fa',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '10px',
                            fontSize: '0.95rem',
                            border: `1px solid ${currentColors.border}`,
                            transition: 'background-color 0.2s',
                          }}
                        >
                          {/* Názov suroviny */}
                          <strong style={{ color: currentColors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ri.ingredientName}</strong>

                          {/* Množstvo */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                            {isEditing ? (
                              <>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={editDraft.ingredientsRaw[ri.id] ?? String(ri.quantity)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const val = parseFloat(raw);
                                    setEditDraft(prev => ({
                                      ...prev,
                                      ingredientsRaw: { ...prev.ingredientsRaw, [ri.id]: raw },
                                      ingredients: { ...prev.ingredients, [ri.id]: isNaN(val) ? 0 : val },
                                    }));
                                  }}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setEditDraft(prev => ({
                                      ...prev,
                                      ingredientsRaw: { ...prev.ingredientsRaw, [ri.id]: String(val) },
                                      ingredients: { ...prev.ingredients, [ri.id]: val },
                                    }));
                                  }}
                                  style={{
                                    width: '70px',
                                    padding: '0.35rem 0.5rem',
                                    border: `2px solid ${currentColors.secondary}`,
                                    borderRadius: '5px',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    textAlign: 'center',
                                    outline: 'none',
                                    color: currentColors.text,
                                    backgroundColor: '#fff',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ color: currentColors.text, opacity: 0.7, fontSize: '0.85rem', minWidth: '18px' }}>{ri.unit}</span>
                              </>
                            ) : (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'baseline',
                                justifyContent: 'center',
                                gap: '3px',
                                width: '90px',
                                padding: '0.35rem 0.5rem',
                                border: `2px solid ${currentColors.border}`,
                                borderRadius: '5px',
                                fontSize: '0.9rem',
                                fontWeight: 'bold',
                                textAlign: 'center',
                                color: currentColors.text,
                                backgroundColor: '#fff',
                                boxSizing: 'border-box',
                              }}>
                                {ri.quantity}
                                <span style={{ fontWeight: 'normal', opacity: 0.6, fontSize: '0.8rem' }}>{ri.unit}</span>
                              </span>
                            )}
                          </div>

                          {/* Balenie */}
                          <span style={{
                            fontSize: '0.8rem',
                            whiteSpace: 'nowrap',
                            minWidth: '100px',
                            textAlign: 'center',
                            color: currentColors.secondary,
                            backgroundColor: currentColors.primary,
                            padding: '0.35rem 0.6rem',
                            borderRadius: '6px',
                            border: `1px solid ${currentColors.border}`,
                            fontWeight: 600,
                          }}>
                            {ri.price.toFixed(2)} € / bal {ri.packageSize} {ri.unit}
                            {ri.indivisible && (
                              <span style={{ marginLeft: '0.3rem', color: currentColors.secondary, fontWeight: 700, fontSize: '0.75rem' }}>
                                ∞
                              </span>
                            )}
                          </span>

                          {/* Cena */}
                          <span style={{
                            color: currentColors.text,
                            fontWeight: 800,
                            textAlign: 'center',
                            backgroundColor: '#fff',
                            padding: '0.35rem 0.6rem',
                            borderRadius: '6px',
                            border: `1px solid ${currentColors.border}`,
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap',
                          }}>
                            {displayCost.toFixed(2)} €
                          </span>

                          {/* Remove button */}
                            <button
                              onClick={() => isEditing && removeRecipeIngredient(recipe.id, ri.id)}
                              disabled={!isEditing}
                              style={{
                                background: isEditing ? '#fff' : 'transparent',
                                border: `1px solid ${isEditing ? currentColors.border : 'transparent'}`,
                                color: isEditing ? currentColors.text : 'transparent',
                                borderRadius: '6px',
                                cursor: isEditing ? 'pointer' : 'default',
                                width: '28px',
                                height: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                padding: 0,
                                transition: 'all 0.15s ease',
                                flexShrink: 0,
                                pointerEvents: isEditing ? 'auto' : 'none',
                              }}
                              onMouseEnter={(e) => {
                                if (!isEditing) return;
                                e.currentTarget.style.background = '#ff6b6b';
                                e.currentTarget.style.borderColor = '#ff6b6b';
                                e.currentTarget.style.color = '#fff';
                              }}
                              onMouseLeave={(e) => {
                                if (!isEditing) return;
                                e.currentTarget.style.background = '#fff';
                                e.currentTarget.style.borderColor = currentColors.border;
                                e.currentTarget.style.color = currentColors.text;
                              }}
                            >
                              ✕
                            </button>
                        </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Hľadaj ingredienciu..."
                        value={recipeSearchInputs[recipe.id] || ''}
                        onChange={(e) => {
                          setRecipeSearchInputs((prev) => ({
                            ...prev,
                            [recipe.id]: e.target.value,
                          }));
                          setRecipeSelectedIngredients((prev) => ({
                            ...prev,
                            [recipe.id]: null,
                          }));
                          setRecipeIngredientErrors((prev) => ({
                            ...prev,
                            [recipe.id]: false,
                          }));
                        }}
                        style={{
                          flex: 1,
                          padding: '0.6rem 0.75rem',
                          borderRadius: '6px',
                          border: recipeIngredientErrors[recipe.id]
                            ? '2px solid #e74c3c'
                            : recipeSelectedIngredients[recipe.id]
                            ? `2px solid ${currentColors.secondary}`
                            : `1px solid ${currentColors.border}`,
                          fontSize: '0.9rem',
                          backgroundColor: recipeSelectedIngredients[recipe.id] ? currentColors.primary : '#fff',
                          color: '#1f1f1f',
                          boxShadow: recipeIngredientErrors[recipe.id]
                            ? '0 0 0 3px rgba(231, 76, 60, 0.1)'
                            : recipeSelectedIngredients[recipe.id]
                            ? `0 0 0 3px ${currentColors.secondary}20`
                            : `0 6px 16px ${currentColors.secondary}25`,
                          outline: 'none',
                        }}
                      />
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="number"
                          placeholder="Množstvo"
                          min="0"
                          step="0.1"
                          value={recipeQuantities[recipe.id] || ''}
                          onChange={(e) => {
                            setRecipeQuantities((prev) => ({
                              ...prev,
                              [recipe.id]: e.target.value,
                            }));
                            setRecipeQuantityErrors((prev) => ({
                              ...prev,
                              [recipe.id]: false,
                            }));
                          }}
                          style={{
                            width: '100px',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: recipeQuantityErrors[recipe.id]
                              ? '2px solid #e74c3c'
                              : `1px solid ${currentColors.border}`,
                            fontSize: '0.9rem',
                            backgroundColor: '#fff',
                            color: '#1f1f1f',
                            boxShadow: recipeQuantityErrors[recipe.id]
                              ? '0 0 0 3px rgba(231, 76, 60, 0.1)'
                              : `0 6px 16px ${currentColors.secondary}25`,
                            outline: 'none',
                            MozAppearance: 'textfield' as any,
                          }}
                        />
                        <style>
                          {`
                            input[type="number"]::-webkit-inner-spin-button,
                            input[type="number"]::-webkit-outer-spin-button {
                              -webkit-appearance: none;
                              margin: 0;
                            }
                          `}
                        </style>
                        <div style={{
                          position: 'absolute',
                          right: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}>
                          <button
                            onClick={() => {
                              const current = parseFloat(recipeQuantities[recipe.id] || '0');
                              setRecipeQuantities((prev) => ({
                                ...prev,
                                [recipe.id]: String(current + 1),
                              }));
                            }}
                            style={{
                              width: '20px',
                              height: '14px',
                              border: 'none',
                              background: currentColors.secondary,
                              borderRadius: '3px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              color: '#fff',
                              fontWeight: 'bold',
                              padding: 0,
                            }}
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => {
                              const current = parseFloat(recipeQuantities[recipe.id] || '0');
                              if (current > 0) {
                                setRecipeQuantities((prev) => ({
                                  ...prev,
                                  [recipe.id]: String(Math.max(0, current - 1)),
                                }));
                              }
                            }}
                            style={{
                              width: '20px',
                              height: '14px',
                              border: 'none',
                              background: currentColors.secondary,
                              borderRadius: '3px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              color: '#fff',
                              fontWeight: 'bold',
                              padding: 0,
                            }}
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const selected = recipeSelectedIngredients[recipe.id];
                          const qty = parseFloat(recipeQuantities[recipe.id] || '');
                          
                          // Show errors if fields missing or invalid
                          if (!selected || !selected.id) {
                            setRecipeIngredientErrors((prev) => ({ ...prev, [recipe.id]: true }));
                          }
                          if (!qty || Number.isNaN(qty) || qty <= 0) {
                            setRecipeQuantityErrors((prev) => ({ ...prev, [recipe.id]: true }));
                          }
                          
                          // Stop if any validation failed
                          if (!selected || !selected.id || !qty || Number.isNaN(qty) || qty <= 0) {
                            return;
                          }
                          
                          addRecipeIngredient(
                            recipe.id,
                            selected.id!,
                            selected.name,
                            qty,
                            selected.unit,
                            selected.price,
                            selected.packageSize,
                            selected.indivisible
                          );
                          setRecipeSelectedIngredients((prev) => ({ ...prev, [recipe.id]: null }));
                          setRecipeSearchInputs((prev) => ({ ...prev, [recipe.id]: '' }));
                          setRecipeQuantities((prev) => ({ ...prev, [recipe.id]: '' }));
                          setRecipeQuantityErrors((prev) => ({ ...prev, [recipe.id]: false }));
                          setRecipeIngredientErrors((prev) => ({ ...prev, [recipe.id]: false }));
                        }}
                        style={{
                          background: currentColors.secondary,
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.6rem 0.9rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: `0 4px 12px ${currentColors.secondary}40`,
                        }}
                      >
                        Pridať
                      </button>
                    </div>

                    {recipeSearchInputs[recipe.id] && (
                      <div
                        style={{
                          background: `linear-gradient(135deg, #ffffff 0%, ${currentColors.primary} 85%)`,
                          border: `1px solid ${currentColors.border}`,
                          borderRadius: '10px',
                          maxHeight: '220px',
                          overflowY: 'auto',
                          marginBottom: '0.75rem',
                          boxShadow: `0 12px 28px ${currentColors.secondary}35`,
                        }}
                      >
                        {ingredients
                          .filter((ing) =>
                            ing.name
                              .toLowerCase()
                              .startsWith(recipeSearchInputs[recipe.id].toLowerCase())
                          )
                          .slice(0, 8)
                          .map((ing) => (
                            <div
                              key={ing.id || `ing-${Math.random()}`}
                              onClick={() => {
                                setRecipeSelectedIngredients((prev) => ({
                                  ...prev,
                                  [recipe.id]: ing,
                                }));
                                setRecipeSearchInputs((prev) => ({
                                  ...prev,
                                  [recipe.id]: ing.name,
                                }));
                              }}
                              style={{
                                padding: '0.75rem 1rem',
                                cursor: 'pointer',
                                borderBottom: `1px solid ${currentColors.border}`,
                                backgroundColor: '#fff',
                                color: '#1f1f1f',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                              onMouseEnter={(e) =>
                                {
                                  e.currentTarget.style.backgroundColor = currentColors.secondary;
                                  e.currentTarget.style.color = '#fff';
                                }
                              }
                              onMouseLeave={(e) =>
                                {
                                  e.currentTarget.style.backgroundColor = '#fff';
                                  e.currentTarget.style.color = '#1f1f1f';
                                }
                              }
                            >
                              <div style={{ fontWeight: 600 }}>{ing.name}</div>
                              <div style={{ fontSize: '0.85rem', color: 'inherit', opacity: 0.85 }}>
                                {ing.price.toFixed(2)} € / bal {ing.packageSize || 1} {ing.unit}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      background: `linear-gradient(to right, ${currentColors.secondary}cc 0%, ${currentColors.primary} 100%)`,
                      padding: '1rem 1.25rem',
                      textAlign: 'right',
                      fontWeight: 800,
                      color: '#fff',
                      fontSize: '1.05rem',
                      borderTop: `1px solid ${currentColors.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: currentColors.secondary, textTransform: 'uppercase' as const, letterSpacing: '0.08em', opacity: 0.8 }}>Celková cena receptu</span>
                      <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#fff', background: currentColors.secondary, padding: '0.2rem 0.85rem', borderRadius: '999px', boxShadow: `0 2px 8px ${currentColors.secondary}50` }}>
                        {(() => {
                          if (isEditing) {
                            const ings = recipeIngredientsByRecipe[recipe.id] || [];
                            const total = ings.reduce((sum, ri) => {
                              const q = editDraft.ingredients[ri.id] ?? ri.quantity;
                              return sum + getIngredientCostWithQty(ri, q);
                            }, 0);
                            return Math.round(total * 100) / 100;
                          }
                          return getRecipeTotalPrice(recipe.id);
                        })().toFixed(2)} €
                      </span>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Tab Content: Ingrediencie */}
        {activeTab === 'Ingrediencie' && (
          <section style={{
            ...styles.section,
            backgroundColor: '#fff',
            border: `2px solid ${currentColors.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ ...styles.sectionTitle, color: currentColors.text, margin: 0 }}>Ingrediencie</h2>
                <div style={{ position: 'relative' }} data-sort-dropdown>
                  <button
                    onClick={(e) => {
                      const menu = e.currentTarget.nextElementSibling as HTMLElement;
                      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                    }}
                    style={{
                      padding: '0.3rem 0.7rem',
                      borderRadius: '6px',
                      border: `1.5px solid ${currentColors.border}`,
                      fontSize: '0.8rem',
                      color: currentColors.text,
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      outline: 'none',
                      fontWeight: 500,
                    }}
                  >
                    Zoradiť ▾
                  </button>
                  <div data-sort-dropdown-menu style={{
                    display: 'none',
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    backgroundColor: '#fff',
                    border: `1.5px solid ${currentColors.border}`,
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 10,
                    overflow: 'hidden',
                    minWidth: '80px',
                  }}>
                    {[{ value: 'az' as const, label: 'A → Z' }, { value: 'za' as const, label: 'Z → A' }].map(opt => (
                      <div
                        key={opt.value}
                        onClick={(e) => {
                          setIngredientsSortDir(opt.value);
                          if (opt.value === 'az') {
                            setIngredients(prev => [...prev].sort((a, b) => a.name.localeCompare(b.name, 'sk')));
                          } else {
                            setIngredients(prev => [...prev].sort((a, b) => b.name.localeCompare(a.name, 'sk')));
                          }
                          (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                        }}
                        style={{
                          padding: '0.45rem 0.75rem',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          color: ingredientsSortDir === opt.value ? '#fff' : currentColors.text,
                          backgroundColor: ingredientsSortDir === opt.value ? currentColors.secondary : '#fff',
                          fontWeight: ingredientsSortDir === opt.value ? 700 : 400,
                          transition: 'background-color 0.1s',
                        }}
                        onMouseEnter={(e) => {
                          if (ingredientsSortDir !== opt.value) e.currentTarget.style.backgroundColor = currentColors.primary;
                        }}
                        onMouseLeave={(e) => {
                          if (ingredientsSortDir !== opt.value) e.currentTarget.style.backgroundColor = '#fff';
                        }}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={addIngredient} disabled={!ingredientsEditMode} style={{
                  ...styles.addButton,
                  backgroundColor: ingredientsEditMode ? tabColors.Ingrediencie.secondary : '#ccc',
                  color: '#fff',
                  boxShadow: ingredientsEditMode ? '0 2px 8px rgba(46, 125, 50, 0.3)' : 'none',
                  cursor: ingredientsEditMode ? 'pointer' : 'not-allowed',
                  opacity: ingredientsEditMode ? 1 : 0.6,
                  margin: 0,
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                }}>+ Ďalší produkt</button>
                {ingredientsEditMode ? (
                  <>
                    <button
                      onClick={saveIngredients}
                      disabled={savingIngredients}
                      style={{
                        background: '#2ecc71',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.5rem 1rem',
                        cursor: savingIngredients ? 'wait' : 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        opacity: savingIngredients ? 0.7 : 1,
                        minWidth: '90px',
                        textAlign: 'center' as const,
                      }}
                    >
                      {savingIngredients ? 'Ukladám...' : '💾 Uložiť'}
                    </button>
                    <button
                      onClick={cancelEditIngredients}
                      style={{
                        background: '#95a5a6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        minWidth: '80px',
                        textAlign: 'center' as const,
                      }}
                    >
                      Zrušiť
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startEditIngredients}
                    style={{
                      background: currentColors.secondary,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                      minWidth: '90px',
                      textAlign: 'center' as const,
                    }}
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>
            </div>
            <div style={styles.optionsContainer}>
              {ingredients.map((ing, idx) => (
                <div
                  key={ing.id ?? `new-${idx}`}
                  style={{
                    ...styles.optionBox,
                    backgroundColor: ingredientsEditMode ? '#fffcf0' : currentColors.primary,
                    border: ingredientsEditMode ? `2px solid ${currentColors.secondary}` : `2px solid ${currentColors.border}`,
                    boxShadow: `0 2px 12px ${currentColors.border}55`,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={ing.name}
                      onChange={(e) => ingredientsEditMode && updateIngredient(idx, 'name', e.target.value)}
                      readOnly={!ingredientsEditMode}
                      style={{ ...styles.inputField, border: `1.5px solid ${currentColors.border}`, flex: 1, minWidth: '100px', cursor: ingredientsEditMode ? 'text' : 'default', opacity: ingredientsEditMode ? 1 : 0.85 }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Veľkosť balenia"
                      value={ing.packageSize}
                      onChange={(e) => ingredientsEditMode && updateIngredient(idx, 'packageSize', parseFloat(e.target.value) || 0)}
                      readOnly={!ingredientsEditMode}
                      style={{ ...styles.inputField, border: `1.5px solid ${currentColors.border}`, width: '90px', minWidth: '70px', flex: '0 0 auto', cursor: ingredientsEditMode ? 'text' : 'default', opacity: ingredientsEditMode ? 1 : 0.85 }}
                    />
                    <div style={{ position: 'relative', width: '70px', minWidth: '70px', maxWidth: '70px', flex: '0 0 auto', boxSizing: 'border-box', overflow: 'hidden', borderRadius: '8px' }}>
                      <select
                        value={ing.unit}
                        onChange={(e) => ingredientsEditMode && updateIngredient(idx, 'unit', e.target.value)}
                        disabled={!ingredientsEditMode}
                        style={{ 
                          ...styles.inputField, 
                          border: `1.5px solid ${currentColors.border}`, 
                          width: '100%',
                          minWidth: '0',
                          padding: '0.6rem 2rem 0.6rem 0.6rem',
                          boxSizing: 'border-box',
                          appearance: 'none',
                          WebkitAppearance: 'none',
                          MozAppearance: 'none',
                          borderRadius: '8px',
                          cursor: ingredientsEditMode ? 'pointer' : 'default',
                          opacity: ingredientsEditMode ? 1 : 0.85,
                        }}
                      >
                        {UNITS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        style={{
                          position: 'absolute',
                          right: 6,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 18,
                          height: 18,
                          background: currentColors.secondary,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: 10,
                          color: '#fff',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: 'none'
                        }}
                        aria-hidden="true"
                      >
                        ▼
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena"
                      value={ingredientsEditMode ? (ing.price === 0 && (ing as any)._priceRaw === '' ? '' : (ing as any)._priceRaw ?? ing.price) : ing.price}
                      onChange={(e) => {
                        if (!ingredientsEditMode) return;
                        updateIngredient(idx, '_priceRaw' as any, e.target.value);
                        if (e.target.value !== '') updateIngredient(idx, 'price' as any, parseFloat(e.target.value) || 0);
                      }}
                      onBlur={(e) => {
                        if (!ingredientsEditMode) return;
                        const val = parseFloat(e.target.value) || 0;
                        updateIngredient(idx, 'price' as any, val);
                        updateIngredient(idx, '_priceRaw' as any, undefined);
                      }}
                      readOnly={!ingredientsEditMode}
                      style={{ ...styles.inputField, border: `1.5px solid ${currentColors.border}`, width: '80px', minWidth: '65px', flex: 0, cursor: ingredientsEditMode ? 'text' : 'default', opacity: ingredientsEditMode ? 1 : 0.85 }}
                    />
                    <input
                      type="checkbox"
                      checked={ing.indivisible}
                      onChange={(e) => ingredientsEditMode && updateIngredient(idx, 'indivisible', e.target.checked)}
                      disabled={!ingredientsEditMode}
                      style={{ 
                        width: '22px', 
                        height: '22px', 
                        minWidth: '22px', 
                        maxWidth: '22px', 
                        cursor: ingredientsEditMode ? 'pointer' : 'default', 
                        accentColor: '#2e7d32', 
                        marginLeft: '2px', 
                        marginRight: '2px',
                        filter: ing.indivisible ? 'none' : 'opacity(0.5) saturate(0.3)',
                      }}
                    />
                    <button onClick={() => ingredientsEditMode && removeIngredient(idx)} disabled={!ingredientsEditMode} style={{
                      ...styles.removeButton,
                      width: '42px',
                      backgroundColor: ingredientsEditMode ? tabColors.Ingrediencie.secondary : '#ccc',
                      boxShadow: ingredientsEditMode ? '0 1px 4px rgba(46, 125, 50, 0.25)' : 'none',
                      cursor: ingredientsEditMode ? 'pointer' : 'not-allowed',
                      opacity: ingredientsEditMode ? 1 : 0.5,
                    }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tab Content: Profil */}
        {activeTab === 'Profil' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Profil card */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '2px solid #e9d5ff', overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg, #fdf4ff 0%, #ede9fe 100%)', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.4rem' }}>👤</span>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#7c3aed' }}>Môj profil</h2>
              </div>
              <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#faf7ff', borderRadius: '10px', border: '1px solid #ede9fe' }}>
                  <span style={{ fontSize: '1.1rem' }}>📧</span>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500, marginBottom: '0.1rem' }}>Email</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' }}>{user?.email ?? '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#faf7ff', borderRadius: '10px', border: '1px solid #ede9fe' }}>
                  <span style={{ fontSize: '1.1rem' }}>🏪</span>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500, marginBottom: '0.1rem' }}>Názov cukrárne</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' }}>
                      {userBakeryName ?? '— (načítavam...)'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#faf7ff', borderRadius: '10px', border: '1px solid #ede9fe' }}>
                  <span style={{ fontSize: '1.1rem' }}>🔗</span>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500, marginBottom: '0.1rem' }}>URL adresa</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' }}>
                      {userBakerySlug
                        ? `${window.location.origin}/${userBakerySlug}`
                        : '— (načítavam...)'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#faf7ff', borderRadius: '10px', border: '1px solid #ede9fe' }}>
                  <span style={{ fontSize: '1.1rem' }}>📦</span>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500, marginBottom: '0.1rem' }}>Rola</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.1rem' }}>
                      {(userRole as string) === 'super_admin' ? (
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', background: '#7c3aed', borderRadius: '999px', padding: '0.15rem 0.65rem' }}>⚡ Super Admin</span>
                      ) : userRole === 'owner' ? (
                        <>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', background: '#7c3aed', borderRadius: '999px', padding: '0.15rem 0.65rem' }}>Free</span>
                          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>— upgrade pripravujeme</span>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Načítavam...</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Téma */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '2px solid #e9d5ff', overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg, #fdf4ff 0%, #ede9fe 100%)', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>🎨</span>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#7c3aed' }}>Dizajn & Téma</h2>
                </div>
                {themeEditMode ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={async () => { await setTheme(pendingThemeId); setThemeEditMode(false); }}
                      style={{ padding: '0.4rem 1rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      💾 Uložiť
                    </button>
                    <button
                      onClick={() => {
                        const saved = themes.find(t => t.id === themeId);
                        if (saved) Object.entries(saved.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
                        setPendingThemeId(themeId);
                        setThemeEditMode(false);
                      }}
                      style={{ padding: '0.4rem 0.9rem', background: '#f1f5f9', color: '#64748b', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Zrušiť
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setPendingThemeId(themeId); setThemeEditMode(true); }}
                    style={{ padding: '0.4rem 0.9rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#6b7280' }}>
                  {themeEditMode ? 'Zvoľ farebnú tému a klikni Uložiť.' : 'Aktuálna farebná téma pre tvoju homepage.'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  {themes.map(t => {
                    const isActive = themeEditMode ? pendingThemeId === t.id : themeId === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          if (!themeEditMode) return;
                          setPendingThemeId(t.id);
                          Object.entries(t.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
                        }}
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: '12px',
                          border: isActive ? `2px solid ${t.vars['--color-primary']}` : '2px solid #e5e7eb',
                          background: isActive ? t.vars['--color-primary-bg'] : '#f9fafb',
                          color: isActive ? t.vars['--color-primary'] : '#374151',
                          fontWeight: isActive ? 700 : 500,
                          fontFamily: 'inherit',
                          fontSize: '0.9rem',
                          cursor: themeEditMode ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.15s ease',
                          boxShadow: isActive ? `0 0 0 3px ${t.vars['--color-primary']}22` : 'none',
                          opacity: !themeEditMode && !isActive ? 0.55 : 1,
                        }}
                      >
                        <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: t.vars['--color-primary'], flexShrink: 0, display: 'inline-block' }} />
                        {t.label}
                        {isActive && <span style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Štatistiky */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '2px solid #e9d5ff', overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg, #fdf4ff 0%, #ede9fe 100%)', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>📊</span>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#7c3aed' }}>Štatistiky</h2>
                </div>
                <button
                  onClick={() => loadVisitStats(userBakeryId)}
                  disabled={loadingStats}
                  style={{ padding: '0.4rem 0.9rem', background: loadingStats ? '#e5e7eb' : '#7c3aed', color: loadingStats ? '#9ca3af' : '#fff', border: 'none', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: loadingStats ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                >
                  {loadingStats ? 'Načítavam...' : '↻ Obnoviť'}
                </button>
              </div>
              <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Stat row cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                  {[
                    { icon: '👁️', label: 'Celkom návštev', value: loadingStats ? '…' : String(visitStats.total) },
                    { icon: '🕐', label: 'Posledných 24h', value: loadingStats ? '…' : String(visitStats.last24h) },
                    { icon: '📦', label: 'Aktívne objednávky', value: '— (pripravuje sa)' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: '#faf7ff', borderRadius: '12px', border: '1px solid #ede9fe', padding: '0.9rem 1rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>{stat.icon}</div>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 500, marginBottom: '0.25rem', lineHeight: 1.3 }}>{stat.label}</div>
                      <div style={{ fontSize: stat.value.length > 5 ? '0.8rem' : '1.4rem', fontWeight: 700, color: '#7c3aed', lineHeight: 1 }}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                {/* Posledných 7 dní */}
                {visitStats.byDay.length > 0 && (
                  <div style={{ background: '#faf7ff', borderRadius: '12px', border: '1px solid #ede9fe', padding: '0.9rem 1rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7c3aed', marginBottom: '0.6rem' }}>Posledných 7 dní</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {visitStats.byDay.map((item) => {
                        const max = Math.max(...visitStats.byDay.map(d => d.count), 1);
                        const pct = Math.round((item.count / max) * 100);
                        return (
                          <div key={item.day} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.8rem', color: '#6b7280', width: '90px', flexShrink: 0 }}>{item.day}</span>
                            <div style={{ flex: 1, height: '8px', background: '#ede9fe', borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: '#7c3aed', borderRadius: '999px', transition: 'width 0.4s ease' }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7c3aed', width: '50px', textAlign: 'right', flexShrink: 0 }}>{item.count}×</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {loadingStats && (
                  <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '1rem' }}>Načítavam štatistiky...</div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* New Section Modal */}
      {showNewSectionModal && (
        <div
          onClick={() => { if (!newSectionSaving) { setShowNewSectionModal(false); setNewSectionName(''); } }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '2rem 2.5rem',
              minWidth: '340px',
              maxWidth: '90vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              textAlign: 'center',
            }}
          >
            <h2 style={{ margin: '0 0 0.5rem 0', color: currentColors.text, fontSize: '1.3rem' }}>
              Nová sekcia
            </h2>
            <p style={{ margin: '0 0 1.25rem 0', color: '#888', fontSize: '0.9rem' }}>
              Zadajte názov novej sekcie
            </p>
            <input
              autoFocus
              type="text"
              placeholder="Názov sekcie"
              value={newSectionName}
              onChange={e => setNewSectionName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newSectionName.trim()) addNewSection(); }}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '1rem',
                border: `2px solid ${currentColors.border}`,
                borderRadius: '10px',
                boxSizing: 'border-box',
                outline: 'none',
                background: '#fff',
                color: '#1f1f1f',
                fontFamily: 'inherit',
                marginBottom: '1.25rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => { setShowNewSectionModal(false); setNewSectionName(''); }}
                disabled={newSectionSaving}
                style={{
                  padding: '0.65rem 1.5rem',
                  borderRadius: '10px',
                  border: `2px solid ${currentColors.border}`,
                  background: '#fff',
                  color: currentColors.text,
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Zrušiť
              </button>
              <button
                onClick={addNewSection}
                disabled={!newSectionName.trim() || newSectionSaving}
                style={{
                  padding: '0.65rem 1.5rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: !newSectionName.trim() ? '#ccc' : currentColors.secondary,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: !newSectionName.trim() ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: newSectionSaving ? 0.6 : 1,
                }}
              >
                {newSectionSaving ? 'Vytvárám...' : 'Vytvoriť'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete section modal */}
      {deleteSectionModalOpen && (
        <div
          onClick={() => { if (!deleteSectionSaving) setDeleteSectionModalOpen(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '2rem 2.5rem',
              minWidth: '340px',
              maxWidth: '90vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              textAlign: 'center',
            }}
          >
            <h2 style={{ margin: '0 0 0.5rem 0', color: '#e74c3c', fontSize: '1.3rem' }}>
              Odstrániť sekciu
            </h2>
            <p style={{ margin: '0 0 1.25rem 0', color: '#888', fontSize: '0.95rem' }}>
              Naozaj chcete odstrániť sekciu "{deleteSectionName}?"
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => { setDeleteSectionModalOpen(false); }}
                disabled={deleteSectionSaving}
                style={{
                  padding: '0.65rem 1.5rem',
                  borderRadius: '10px',
                  border: '2px solid #e74c3c',
                  background: '#fff',
                  color: '#e74c3c',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Zrušiť
              </button>
              <button
                onClick={() => deleteSectionKey && actuallyRemoveSection(deleteSectionKey)}
                disabled={deleteSectionSaving}
                style={{
                  padding: '0.65rem 1.5rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#e74c3c',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  opacity: deleteSectionSaving ? 0.6 : 1,
                }}
              >
                {deleteSectionSaving ? 'Mažem...' : 'Vymazať'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  loginWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
  } as React.CSSProperties,
  loginCard: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '400px',
    margin: '1rem',
  } as React.CSSProperties,
  title: {
    margin: 0,
    textAlign: 'center' as const,
    color: '#ff9fc4',
    fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
    fontFamily: "'Dancing Script', cursive",
    fontWeight: 700,
  } as React.CSSProperties,
  loginForm: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  } as React.CSSProperties,
  header: {
    width: '100vw',
    boxSizing: 'border-box' as const,
    backgroundColor: '#ffffff',
    padding: '1rem',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'calc(-50vw + 50%)',
  } as React.CSSProperties,
  headerInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
    maxWidth: '720px',
  } as React.CSSProperties,
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
  } as React.CSSProperties,
  tabButton: {
    padding: '1rem 2.5rem',
    backgroundColor: '#ffffff',
    border: 'none',
    borderBottom: '4px solid transparent',
    cursor: 'pointer',
    fontSize: '1.05rem',
    fontWeight: '600',
    color: '#6c757d',
    transition: 'all 0.3s ease',
    borderRadius: '12px 12px 0 0',
    boxShadow: '0 -2px 6px rgba(0,0,0,0.05)',
    transform: 'translateY(0px)',
    marginRight: '0',
    marginTop: '0',
  } as React.CSSProperties,
  tabButtonActive: {
    fontWeight: 'bold',
    transform: 'translateY(0px)',
    boxShadow: '0 -4px 12px rgba(0,0,0,0.12)',
  } as React.CSSProperties,
  tabBar: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: '0.5rem',
    marginTop: '1.5rem',
    marginBottom: '0',
    maxWidth: '720px',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: '2rem',
    paddingRight: '2rem',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  content: {
    width: '100%',
    maxWidth: '720px',
    margin: '0 auto',
    padding: '2rem',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  section: {
    marginBottom: '0.5rem',
    backgroundColor: '#ffffff',
    border: '1px solid #e6e6e9',
    borderRadius: '10px',
    padding: '1.25rem',
    boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    width: '100%',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  sectionTitle: {
    margin: 0,
    color: '#333',
    fontSize: '1.2rem',
    fontWeight: 'bold',
    fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: '1rem',
  } as React.CSSProperties,
  optionsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    marginBottom: '1rem',
  } as React.CSSProperties,
  optionRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    flexWrap: 'nowrap' as const,
  } as React.CSSProperties,
  optionBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    padding: '1rem',
    backgroundColor: '#ffe0ea',
    borderRadius: '12px',
    border: '2px solid #ffb3d1',
    boxShadow: '0 2px 12px #ffb3d133',
    transition: 'box-shadow 0.2s',
  } as React.CSSProperties,
  inputField: {
    flex: 1,
    minWidth: '120px',
    padding: '0.7rem 1rem',
    borderRadius: '8px',
    border: '1.5px solid #ffb3d1',
    fontSize: '1rem',
    fontFamily: 'inherit',
    background: '#fff',
    backgroundColor: '#ffffff',
    color: '#333',
    WebkitTextFillColor: '#333',
    fontWeight: '500',
    boxShadow: '0 1px 4px #ffb3d122',
    transition: 'border 0.2s',
  } as React.CSSProperties,
  removeButton: {
    padding: '0.6rem 0.75rem',
    backgroundColor: '#ff9fc4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1.1rem',
    minWidth: '40px',
    boxShadow: '0 1px 4px #ffb3d122',
    transition: 'background 0.2s',
  } as React.CSSProperties,
  addButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#ff9fc4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
    marginTop: '1rem',
    marginBottom: '1rem',
    boxShadow: '0 1px 4px #ffb3d122',
    fontWeight: 'bold',
    transition: 'background 0.2s',
  } as React.CSSProperties,
  logoutButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1rem',
  } as React.CSSProperties,
  backButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    width: '100%',
    marginTop: '1rem',
  } as React.CSSProperties,
  input: {
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem',
  } as React.CSSProperties,
  submitButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
  } as React.CSSProperties,
  error: {
    color: '#dc3545',
    fontSize: '0.875rem',
  } as React.CSSProperties,
  visitStatsTab: {
    padding: '2rem 1rem',
    marginTop: '1rem',
  } as React.CSSProperties,
  visitStatsTitle: {
    color: '#ffa9a9ff',
    fontSize: '1.5rem',
    marginBottom: '1.5rem',
    textAlign: 'center',
  } as React.CSSProperties,
  loadingText: {
    textAlign: 'center',
    color: '#6c757d',
    fontSize: '1.1rem',
    padding: '2rem',
  } as React.CSSProperties,
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.5rem',
    maxWidth: '1000px',
    margin: '0 auto',
  } as React.CSSProperties,
  statCard: {
    backgroundColor: '#ffffff',
    padding: '1.5rem',
    borderRadius: '12px',
    border: '2px solid #e6e6e9',
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    textAlign: 'center',
  } as React.CSSProperties,
  statCardWide: {
    backgroundColor: '#ffffff',
    padding: '1.5rem',
    borderRadius: '12px',
    border: '2px solid #e6e6e9',
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    gridColumn: '1 / -1',
  } as React.CSSProperties,
  statLabel: {
    fontSize: '0.9rem',
    color: '#6c757d',
    marginBottom: '0.5rem',
    fontWeight: '500',
  } as React.CSSProperties,
  statValue: {
    fontSize: '2.5rem',
    color: '#ffa9a9ff',
    fontWeight: 'bold',
  } as React.CSSProperties,
  daysList: {
    marginTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  } as React.CSSProperties,
  dayItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e6e6e9',
  } as React.CSSProperties,
  dayDate: {
    fontSize: '1rem',
    color: '#495057',
    fontWeight: '500',
  } as React.CSSProperties,
  dayCount: {
    fontSize: '1.1rem',
    color: '#ffa9a9ff',
    fontWeight: 'bold',
  } as React.CSSProperties,
  cityItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    border: '1.5px solid #e6e6e9',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  cityInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  } as React.CSSProperties,
  cityName: {
    fontSize: '1rem',
    color: '#333',
    fontWeight: '600',
    marginBottom: '0.3rem',
  } as React.CSSProperties,
  cityCountry: {
    fontSize: '0.85rem',
    color: '#6c757d',
  } as React.CSSProperties,
  cityBadge: {
    fontSize: '1.1rem',
    color: '#fff',
    fontWeight: 'bold',
    backgroundColor: '#64b5f6',
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    minWidth: '60px',
    textAlign: 'center',
  } as React.CSSProperties,
};
