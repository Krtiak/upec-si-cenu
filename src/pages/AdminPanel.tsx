import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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
  }

interface SectionData {
  name: string;
  description?: string;
  required?: boolean;
  options: SectionOption[];
}

export function AdminPanel() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  
  // Internal mapping: DB key -> display label (built from DB on load)
  const [keyToLabel, setKeyToLabel] = useState<Record<string, string>>({});
  
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

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

  // Admin form state for sections (keyed by DB key, not label)
  const [sections, setSections] = useState<Record<string, SectionData>>({});

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'UI' | 'Recepty' | 'Ingrediencie' | 'Navstevnost'>('UI');
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [hasSectionMetaSortOrder, setHasSectionMetaSortOrder] = useState<boolean | null>(null);
  // Drag visual state: placeholder index and overlay position
  // placeholderIndex removed; DOM placeholder used instead
  const [dragOverlayPos, setDragOverlayPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [dragOverlayRect, setDragOverlayRect] = useState<{ width: number; left: number; height: number } | null>(null);

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

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown-container]')) {
        setSectionOptionDropdownOpen({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Diameter management state
  const [diameterEnabled, setDiameterEnabled] = useState<Record<string, boolean>>({});
  const [diameterMultipliersMap, setDiameterMultipliersMap] = useState<Record<string, number>>({}); // key: `${sectionKey}:${optionId}`
  const [baseDiameterBySection, setBaseDiameterBySection] = useState<Record<string, string | null>>({});
  const [editingMultiplierKey, setEditingMultiplierKey] = useState<string | null>(null);

  // Farebné schémy pre jednotlivé taby
  const tabColors = {
    UI: { primary: '#ffe0ea', secondary: '#ff9fc4', text: '#d81b60', border: '#ffb3d1' },
    Recepty: { primary: '#f3e5f5', secondary: '#ba68c8', text: '#7b1fa2', border: '#ce93d8' },
    Ingrediencie: { primary: '#e8f5e9', secondary: '#81c784', text: '#2e7d32', border: '#a5d6a7' },
    Navstevnost: { primary: '#e3f2fd', secondary: '#64b5f6', text: '#1565c0', border: '#90caf9' }
  };

  const currentColors = tabColors[activeTab];

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (user) {
      loadFromDb();
      loadVisitStats();
      loadIngredients();
      loadRecipes();
    }
  }, [user]);

  async function checkSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    } catch (err) {
      console.error('Error checking session:', err);
    } finally {
      setLoading(false);
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
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

    async function loadVisitStats() {
      setLoadingStats(true);
      try {
        // Total visits
        const { count: total, error: totalErr } = await supabase
          .from('page_visits')
          .select('*', { count: 'exact', head: true });
        if (totalErr) throw totalErr;

        // Last 24h visits
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: last24h, error: last24hErr } = await supabase
          .from('page_visits')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', twentyFourHoursAgo);
        if (last24hErr) throw last24hErr;

        // Unique IPs
        const { data: ipsData, error: ipsErr } = await supabase
          .from('page_visits')
          .select('ip');
        if (ipsErr) throw ipsErr;
        const uniqueIps = new Set(ipsData?.map((row) => row.ip).filter(Boolean)).size;

        // Per-day breakdown (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentData, error: recentErr } = await supabase
          .from('page_visits')
          .select('created_at')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false });
        if (recentErr) throw recentErr;

        // Group by day
        const dayMap: Record<string, number> = {};
        recentData?.forEach((row) => {
          const day = row.created_at.split('T')[0]; // YYYY-MM-DD
          dayMap[day] = (dayMap[day] || 0) + 1;
        });
        const byDay = Object.entries(dayMap)
          .map(([day, count]) => ({ day, count }))
          .sort((a, b) => b.day.localeCompare(a.day)); // newest first

        // City/Country breakdown
        const { data: locationData, error: locationErr } = await supabase
          .from('page_visits')
          .select('city, country');
        if (locationErr) throw locationErr;

        const cityMap: Record<string, { country: string; count: number }> = {};
        locationData?.forEach((row) => {
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

  async function loadFromDb() {
    try {
      // Fetch all section meta (bottom descriptions). Try to detect `sort_order` presence.
      let meta: any[] | null = null;
      let metaErr: any = null;
      try {
        const { data, error } = await supabase
          .from('section_meta')
          .select('section, description, required, sort_order');
        meta = data as any[] | null;
        metaErr = error;
        if (!metaErr) {
          // If we were able to query sort_order successfully, mark support
          setHasSectionMetaSortOrder(true);
        }
      } catch (e) {
        // Older DB without sort_order
        setHasSectionMetaSortOrder(false);
        const { data, error } = await supabase
          .from('section_meta')
          .select('section, description, required');
        if (error) throw error;
        meta = (data as any[] | null) || [];
      }

      // Fetch all options
      const { data: opts, error: optsErr } = await supabase
        .from('section_options')
        .select('id, section, name, price, description, sort_order')
        .order('section', { ascending: true })
        .order('sort_order', { ascending: true });
      if (optsErr) throw optsErr;

      // Dynamically build section list from DB keys (meta and options)
      const keysFromMeta = (meta || []).map(m => m.section);
      const keysFromOpts = Array.from(new Set((opts || []).map(o => o.section)));
      const allKeysSet = new Set<string>([...keysFromMeta, ...keysFromOpts]);

      // Helper: turn key into a readable label if unknown
      const toLabel = (key: string) => key
        .split('_')
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');

      const nextSections: Record<string, SectionData> = {};
      const nextKeyToLabel: Record<string, string> = {};

      for (const key of allKeysSet) {
        // Get label from section_meta.description (human label) or generate from key
        const metaRow = (meta || []).find((m: any) => m.section === key) as any;
        const sectionDesc = metaRow?.description || '';
        // Use description as label if it's not a placeholder, else generate from key
        const isPlaceholder = !sectionDesc || sectionDesc.toLowerCase().includes('spodny popis') || sectionDesc.toLowerCase().includes('spodný popis');
        const label = isPlaceholder ? toLabel(key) : sectionDesc;
        
        nextKeyToLabel[key] = label;
        const sectionRequired = Boolean(metaRow?.required);
        const sectionOptions = (opts || [])
          .filter((o) => o.section === key)
          .map((o) => ({ id: o.id, name: o.name || '', price: Number(o.price) || 0, description: o.description || '' }));
        
        nextSections[key] = { 
          name: label, 
          description: sectionDesc, 
          required: sectionRequired, 
          options: sectionOptions 
        };
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
        setSectionOrder(orderedKeys);
        // If DB doesn't support sort_order, but user has a stored order in localStorage,
        // prefer that so Admin's manual reordering survives refresh until DB is migrated.
        try {
          if (!hasSectionMetaSortOrder && typeof window !== 'undefined' && window.localStorage) {
            const stored = window.localStorage.getItem('upec_section_order');
            if (stored) {
              const arr = JSON.parse(stored);
              if (Array.isArray(arr) && arr.length) {
                setSectionOrder(arr);
              }
            }
          }
        } catch (e) {
          // ignore
        }
      } catch (e) {
        setSectionOrder([...allKeysSet]);
      }
      // load which sections have diameter entries
      // Load which sections have diameter entries and load their multipliers
      try {
        const { data: keysRows, error: keysErr } = await supabase
          .from('diameter_multipliers')
          .select('section_key');
        if (!keysErr && keysRows) {
          const keys = Array.from(new Set((keysRows || []).map((r: any) => r.section_key).filter(Boolean)));
          const map: Record<string, boolean> = {};
          keys.forEach(k => { map[k] = true; });
          setDiameterEnabled(map);
          for (const sk of keys) {
            try { await loadDiameterMultipliers(sk); } catch (e) { console.warn('Failed to load multipliers for', sk, e); }
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
  async function loadIngredients() {
    try {
      const { data, error } = await supabase
        .from('ingredients')
        .select('id, name, unit, price, package_size, indivisible')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setIngredients((data || []).map((r: any) => ({
        id: r.id,
        name: r.name || '',
        unit: (r.unit as Unit) || 'ml',
        price: Number(r.price) || 0,
        packageSize: Number(r.package_size) || 100,
        indivisible: Boolean(r.indivisible),
      })));
    } catch (err) {
      console.error('Load ingredients failed:', err);
    }
  }

  async function loadDiameterMultipliers(sectionKey: string) {
    try {
      const { data, error } = await supabase
        .from('diameter_multipliers')
        .select('*')
        .eq('section_key', sectionKey);
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
        const { error } = await supabase.from('diameter_multipliers').delete().eq('section_key', sectionKey);
        if (error) throw error;
        setDiameterEnabled(prev => ({ ...prev, [sectionKey]: false }));
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
        } : null;
      }).filter(Boolean) as any[];
      const { error } = await supabase.from('diameter_multipliers').insert(entries);
      if (error) throw error;
      setDiameterEnabled(prev => ({ ...prev, [sectionKey]: true }));
      await loadDiameterMultipliers(sectionKey);
    } catch (err) {
      console.error('Toggle diameter section failed:', err);
      alert('⚠️ Nepodarilo sa zapnúť/vypnúť správu priemerov');
    }
  }

  // (removed unused `setBaseDiameter` helper)

  async function updateMultiplier(sectionKey: string, optionId: string, newMultiplier: number) {
    try {
      // round to 1 decimal before saving
      const rounded = Math.round((newMultiplier || 1) * 10) / 10;
      const { error } = await supabase
        .from('diameter_multipliers')
        .update({ multiplier: rounded })
        .eq('section_key', sectionKey)
        .eq('option_id', optionId);
      if (error) throw error;
      setDiameterMultipliersMap(prev => ({ ...prev, [`${sectionKey}:${optionId}`]: rounded }));
    } catch (err) {
      console.error('Update multiplier failed:', err);
      alert('⚠️ Nepodarilo sa aktualizovať násobok');
    }
  }

  function addIngredient() {
    setIngredients(prev => [...prev, { name: '', unit: 'ml', price: 0, packageSize: 100, indivisible: false }]);
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

  // ===== RECIPES FUNCTIONS =====
  async function loadRecipes() {
    try {
      const { data: recipesData, error: recipesErr } = await supabase
        .from('recipes')
        .select('id, name, description, created_at')
        .order('created_at', { ascending: false });
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

  function getIngredientCost(ri: RecipeIngredient): number {
    const pkg = ri.packageSize && ri.packageSize > 0 ? ri.packageSize : 1;
    const price = Number(ri.price) || 0;
    const qty = ri.quantity || 0;
    let cost: number;
    if (ri.indivisible) {
      // Always round up to nearest full package
      const packagesNeeded = Math.ceil(qty / pkg);
      cost = packagesNeeded * price;
    } else {
      cost = (price * qty) / pkg;
    }
    // Vždy zaokrúhli na 2 desatinné miesta (ako skutočné eurá)
    return Math.round(cost * 100) / 100;
  }

  function getRecipeTotalPrice(recipeId: string): number {
    const recipeIngs = recipeIngredientsByRecipe[recipeId] || [];
    const total = recipeIngs.reduce((sum, ri) => sum + getIngredientCost(ri), 0);
    // Vždy zaokrúhli na 2 desatinné miesta (ako skutočné eurá)
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

  function removeSection(sectionKey: string) {
    const label = keyToLabel[sectionKey] || sectionKey;
    if (!confirm(`Naozaj chcete odstrániť sekciu "${label}"?`)) return;
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
  }

  function addNewSection() {
    const newLabel = prompt('Zadajte názov novej sekcie:');
    if (!newLabel || !newLabel.trim()) return;
    const label = newLabel.trim();
    // Generate a unique key for database
    const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    // Check if key already exists
    if (sections[key]) {
      alert('Sekcia s týmto kľúčom už existuje!');
      return;
    }
    setKeyToLabel(prev => ({ ...prev, [key]: label }));
    setSections(prev => ({
      ...prev,
      [key]: { name: label, description: label, required: false, options: [] }
    }));
    setSectionOrder(prev => [...prev, key]);
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
      setDragOverlayPos(null);
      setDragOverlayRect(null);
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
    // If pointer originates from an interactive control (input, textarea, select, dropdown button, etc.), don't start drag.
    try {
      const tgt = (e.target as HTMLElement | null);
      if (tgt) {
        // If it's the explicit drag-handle, allow; otherwise block for buttons/inputs
        if (!tgt.closest('.upec-drag-handle')) {
          if (tgt.closest('input, textarea, select, button, [data-dropdown-container]')) return;
        }
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
      setDragOverlayRect({ width: rect.width, left: rect.left, height: rect.height });

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

    try {
      // Update section_meta with new description (which serves as the display label)
      const { error: metaErr } = await supabase
        .from('section_meta')
        .upsert({ section: sectionKey, description: newLabel }, { onConflict: 'section' });
      if (metaErr) throw metaErr;

      // Update local mapping
      setKeyToLabel(prev => ({
        ...prev,
        [sectionKey]: newLabel,
      }));
      setSections(prev => ({
        ...prev,
        [sectionKey]: { ...prev[sectionKey], name: newLabel, description: newLabel },
      }));
    } catch (err) {
      console.error('Rename section failed:', err);
      alert('Nepodarilo sa premenovať sekciu.');
    }
  }

  async function handleSaveAll() {
    setSaving(true);

    try {
      // Detect whether DB supports `linked_recipe_id` column on `section_options`.
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

      // Detect whether DB supports `sort_order` on `section_meta` (for persisting section order)
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

      console.log('🔵 Začínam ukladanie...');
      // Fetch existing sections in DB to detect deletions
      const { data: existingMeta, error: existingMetaErr } = await supabase
        .from('section_meta')
        .select('section');
      if (existingMetaErr) throw existingMetaErr;
      const existingKeys = new Set<string>((existingMeta || []).map(m => m.section));
      
      // Save descriptions (section_meta) and options (section_options)
      const keysToSave = (sectionOrder && sectionOrder.length) ? sectionOrder : Object.keys(sections);
      for (const key of keysToSave) {
        const section = sections[key];
        const label = keyToLabel[key] || key;

        console.log(`📝 Ukladám sekciu: ${label} (${key})`, section);

        // Upsert section meta (one row per section). Try including `sort_order` when supported,
        // but fall back to a payload without it if the DB does not have that column.
        try {
          const baseMetaPayload: any = {
            section: key,
            description: section.description || '',
            required: Boolean(section.required),
          };

          if (useSortOrder) {
            const idx = sectionOrder && sectionOrder.length ? sectionOrder.indexOf(key) : -1;
            const metaPayloadWithOrder = { ...baseMetaPayload, sort_order: idx >= 0 ? idx : 0 };
            const { error } = await supabase
              .from('section_meta')
              .upsert(metaPayloadWithOrder, { onConflict: 'section' });
            if (error) {
              // If the error indicates `sort_order` does not exist, retry without it and remember
              // to skip `sort_order` next time.
              console.warn('Warning: upsert with sort_order failed, retrying without sort_order', error);
              const { error: err2 } = await supabase
                .from('section_meta')
                .upsert(baseMetaPayload, { onConflict: 'section' });
              if (err2) throw err2;
              setHasSectionMetaSortOrder(false);
            }
          } else {
            const { error } = await supabase
              .from('section_meta')
              .upsert(baseMetaPayload, { onConflict: 'section' });
            if (error) throw error;
          }
        } catch (err) {
          console.error(`❌ Meta error pre ${label}:`, err);
          throw err;
        }

        // Replace options for the section, but preserve/update any existing diameter_multipliers
        // 1) fetch existing options + multipliers so we can remap by option name after re-insert
        const { data: oldOptions = [], error: oldOptErr } = await supabase
          .from('section_options')
          .select('id, name')
          .eq('section', key);
        if (oldOptErr) {
          console.error(`❌ Fetch old options error for ${label}:`, oldOptErr);
          throw oldOptErr;
        }
        const oldOptMap: Record<string, string> = {}; // id -> name
        (oldOptions || []).forEach((o: any) => { if (o?.id) oldOptMap[o.id] = o.name; });

        const { data: existingMultipliers = [], error: multErr } = await supabase
          .from('diameter_multipliers')
          .select('id, option_id, base_option_id')
          .eq('section_key', key);
        if (multErr) {
          console.error(`❌ Fetch multipliers error for ${label}:`, multErr);
          throw multErr;
        }

        // Delete existing options (we will insert fresh ones)
        const { error: delErr } = await supabase
          .from('section_options')
          .delete()
          .eq('section', key);
        if (delErr) {
          console.error(`❌ Delete error pre ${label}:`, delErr);
          throw delErr;
        }

        if (section.options.length) {
          const rows = section.options.map((opt, idx) => {
            const baseRow: any = {
              section: key,
              name: opt.name,
              price: opt.price,
              description: opt.description || '',
              sort_order: idx,
            };
            if (hasLinkedColumn && opt.linkedRecipeId) {
              baseRow.linked_recipe_id = opt.linkedRecipeId;
            }

            return baseRow;
          });

          console.log(`➕ Vkladám ${rows.length} možností pre ${label}:`, rows);

          // insert and return inserted ids + names so we can map
          const { data: newInserted = [], error: insErr } = await supabase
            .from('section_options')
            .insert(rows)
            .select('id, name');
          if (insErr) {
            console.error(`❌ Insert error pre ${label}:`, insErr);
            throw insErr;
          }

          const newMap: Record<string, string> = {}; // name -> id
          (newInserted || []).forEach((n: any) => { if (n?.id) newMap[n.name] = n.id; });

          // Update local sections state so option ids match DB ids we just inserted.
          // Remap existing in-memory multipliers and base selection from old option ids to new DB ids
          try {
            // Build name->oldId map from previously fetched oldOptions
            const oldNameToId: Record<string, string> = {};
            (oldOptions || []).forEach((o: any) => { if (o?.id && o?.name) oldNameToId[o.name] = o.id; });

            // Remap diameterMultipliersMap keys that reference old ids to new ids
            setDiameterMultipliersMap(prev => {
              const copy = { ...prev };
              Object.keys(newMap).forEach(name => {
                const oldId = oldNameToId[name];
                const newId = newMap[name];
                if (oldId && newId) {
                  const oldKey = `${key}:${oldId}`;
                  const newKey = `${key}:${newId}`;
                  if (Object.prototype.hasOwnProperty.call(prev, oldKey)) {
                    copy[newKey] = prev[oldKey];
                    delete copy[oldKey];
                  }
                }
              });
              return copy;
            });

            // Update baseDiameterBySection if it referenced an old option id
            setBaseDiameterBySection(prev => {
              const curBase = prev[key];
              if (!curBase) return prev;
              // If current base matches an old id, map to the new id
              const nameForOld = oldOptMap[curBase];
              if (nameForOld && newMap[nameForOld]) {
                return { ...prev, [key]: newMap[nameForOld] };
              }
              return prev;
            });
          } catch (e) {
            console.warn('Warning: remapping local multiplier ids failed', e);
          }

          setSections(prev => {
            const cur = prev[key];
            if (!cur) return prev;
            const updatedOptions = (cur.options || []).map((o: any) => ({ ...o, id: newMap[o.name] || o.id }));
            return { ...prev, [key]: { ...cur, options: updatedOptions } };
          });

          // If diameter management is enabled for this section, recreate/upsert multiplier rows
          try {
            if (Boolean(diameterEnabled[key])) {
              // Determine base name from current UI state if set
              const baseFrontendId = baseDiameterBySection[key];
              let baseName: string | null = null;
              if (baseFrontendId) {
                const frontendOpt = section.options.find((o: any) => o.id === baseFrontendId);
                if (frontendOpt) baseName = frontendOpt.name;
              }

              // If base not found via frontend id, try to infer from existingMultipliers (old base)
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
                  section_key: key,
                  base_option_id: baseDbId,
                  option_id: optDbId,
                  multiplier: Number(mult.toFixed(1)),
                };
              }).filter(Boolean) as any[];

              if (entries.length) {
                const { error: upsertErr } = await supabase
                  .from('diameter_multipliers')
                  .upsert(entries, { onConflict: 'section_key,option_id' });
                if (upsertErr) console.warn('Warning: failed to upsert diameter multipliers for', key, upsertErr);
              }
            }
          } catch (e) {
            console.warn('Warning: failed to recreate/upsert multipliers for section', key, e);
          }
        }
        
        console.log(`✅ Hotovo: ${label}`);
        // This key is still present; remove from existingKeys set so leftovers can be deleted
        existingKeys.delete(key);
      }

      // Delete any sections that no longer exist (both meta and options)
      const keysToRemove = Array.from(existingKeys);
      for (const k of keysToRemove) {
        console.log(`🗑️ Odstraňujem sekciu z DB: ${k}`);
        const { error: delOptsErr } = await supabase
          .from('section_options')
          .delete()
          .eq('section', k);
        if (delOptsErr) throw delOptsErr;
        const { error: delMetaErr } = await supabase
          .from('section_meta')
          .delete()
          .eq('section', k);
        if (delMetaErr) throw delMetaErr;
      }

      // Save ingredients (upsert each row with non-empty name)
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
          const { error } = await supabase
            .from('ingredients')
            .update(payload)
            .eq('id', it.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('ingredients')
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;
          if (data?.id) it.id = data.id;
        }
      }

      // Ensure diameter_multipliers rows exist for sections with the toggle enabled.
      try {
        for (const sectionKey of keysToSave) {
          if (!Boolean(diameterEnabled[sectionKey])) continue;
          // check if multiplier rows exist
          const { data: existing = [], error: exErr } = await supabase
            .from('diameter_multipliers')
            .select('option_id')
            .eq('section_key', sectionKey)
            .limit(1);
          if (exErr) {
            console.warn('Warning: cannot verify diameter rows for', sectionKey, exErr);
            continue;
          }
          if ((existing || []).length === 0) {
            // insert default multiplier rows (1.0) for all options in this section
            const { data: opts, error: optsErr } = await supabase
              .from('section_options')
              .select('id')
              .eq('section', sectionKey);
            if (optsErr) {
              console.warn('Warning: cannot fetch section options for', sectionKey, optsErr);
              continue;
            }
            const entries = (opts || []).map((o: any) => ({
              section_key: sectionKey,
              base_option_id: null,
              option_id: o.id,
              multiplier: 1.0,
            }));
            if (entries.length) {
              const { error: insErr } = await supabase.from('diameter_multipliers').insert(entries);
              if (insErr) console.warn('Warning: failed to insert default diameter rows for', sectionKey, insErr);
            }
          }
        }
      } catch (e) {
        console.warn('Warning: post-save diameter persistence check failed', e);
      }

      // Refresh diameter multipliers state so base selection and multipliers reflect saved DB
      try {
        // fetch distinct section_key values present in DB and reload them
        const { data: keysRows, error: keysErr } = await supabase
          .from('diameter_multipliers')
          .select('section_key');
        if (!keysErr && keysRows) {
          const keys = Array.from(new Set((keysRows || []).map((r: any) => r.section_key).filter(Boolean)));
          const map: Record<string, boolean> = {};
          keys.forEach(k => { map[k] = true; });
          setDiameterEnabled(map);
          for (const sk of keys) {
            await loadDiameterMultipliers(sk);
          }
        } else if (keysErr) {
          console.warn('Warning: failed to fetch diameter section keys after save', keysErr);
        }
      } catch (e) {
        console.warn('Warning: failed to reload diameter multipliers after save', e);
      }

      console.log('🎉 Všetko uložené!');
      alert('✅ Zmeny úspešne uložené do databázy!');
      // Persist order into localStorage as a fallback when DB doesn't support sort_order
      try {
        if (!useSortOrder && typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('upec_section_order', JSON.stringify(sectionOrder || []));
        }
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error('❌ Chyba pri ukladaní:', err);
      alert(`❌ Chyba pri ukladaní: ${err instanceof Error ? err.message : 'Neznáma chyba'}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Načítavam...</div>;
  }

  if (!user) {
    return (
      <div style={styles.loginWrapper}>
        <div style={styles.loginCard}>
          <h1 style={styles.title}>⚙️ Admin Panel</h1>
          <form onSubmit={handleLogin} style={styles.loginForm}>
            <input
              type="email"
              placeholder="Email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="password"
              placeholder="Heslo"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              style={styles.input}
            />
            {loginError && <p style={styles.error}>{loginError}</p>}
            <button type="submit" disabled={loginLoading} style={styles.submitButton}>
              {loginLoading ? 'Prihlásujem...' : 'Prihlásiť sa'}
            </button>
          </form>
          <button onClick={() => navigate('/')} style={styles.backButton}>
            ← Späť na kalkulačku
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.title}>⚙️ Admin Panel</h1>
          <div style={styles.headerRight}>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              style={styles.saveButton}
            >
              {saving ? 'Ukladám...' : '💾 Uložiť'}
            </button>
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
          onClick={() => setActiveTab('Navstevnost')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'Navstevnost' ? {
              ...styles.tabButtonActive,
              backgroundColor: tabColors.Navstevnost.primary,
              borderBottom: `4px solid ${tabColors.Navstevnost.secondary}`,
              color: tabColors.Navstevnost.text,
            } : {}),
          }}
        >
          Návštevnosť
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
          <>
          {/* Dynamically render all sections */}
          {(sectionOrder && sectionOrder.length ? sectionOrder : Object.keys(sections)).map((sectionKey) => {
              const section = sections[sectionKey];
              const label = keyToLabel[sectionKey] || sectionKey;
              return (
                <section
                  key={sectionKey}
                  data-section-key={sectionKey}
                  ref={(el) => setSectionRef(sectionKey, el)}
                  draggable={false}
                  onDragOver={(e) => onDragOverSection(e)}
                  onDrop={onDropSection}
                  onDragEnd={onDragEndSection}
                  onPointerDown={(e) => onPointerDownSection(e, sectionKey)}
                  style={{
                    ...styles.section,
                    backgroundColor: '#fff',
                    border: `2px solid ${currentColors.border}`,
                    willChange: 'transform'
                  }}
                >
                <div style={styles.sectionHeader}>
                  {/* Left group: drag handle + title input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}> 
                    <button
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); onPointerDownSection(e, sectionKey); }}
                      title="Presuň sekciu"
                      aria-label="Presuň sekciu"
                      className="upec-drag-handle"
                      style={{
                        cursor: 'grab',
                        marginRight: 0,
                        border: 'none',
                        background: 'transparent',
                        padding: '0.25rem 0.5rem',
                        borderRadius: 6,
                        fontSize: '16px',
                        lineHeight: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ≡
                    </button>

                    <input
                    type="text"
                    defaultValue={label}
                    onBlur={(e) => {
                      const newLabel = e.target.value;
                      if (newLabel && newLabel.trim() && newLabel.trim() !== label) {
                        renameSection(sectionKey, newLabel.trim());
                      }
                    }}
                    style={{
                      ...styles.sectionTitle,
                      color: '#333',
                      margin: 0,
                      border: '1px solid ' + currentColors.border,
                      borderRadius: '6px',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#f79ec5',
                      width: 'auto',
                      maxWidth: '520px',
                      textAlign: 'left'
                    }}
                  />
                  </div>
                  <button
                    onClick={() => removeSection(sectionKey)}
                    style={styles.removeSectionButton}
                    title="Odstrániť sekciu"
                  >
                    ✕
                  </button>
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
                              updateOption(sectionKey, idx, 'name', e.target.value);
                              if (opt.linkedRecipeId) {
                                updateOption(sectionKey, idx, 'linkedRecipeId', null);
                              }
                            }}
                            style={{ ...styles.inputField, width: '100%', paddingRight: 36 }}
                            onFocus={() => {
                              if (opt.linkedRecipeId) {
                                setSectionOptionDropdownOpen(prev => ({ ...prev, [dropdownKey]: false }));
                              }
                            }}
                          />
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
                              // Ak je dropdown otvorený, zatvor ho; ak je zatvorený, otvor len tento a zatvor všetky ostatné
                              if (prev[dropdownKey]) {
                                return { ...prev, [dropdownKey]: false };
                              } else {
                                // Zatvor všetky ostatné a otvor len tento
                                return { [dropdownKey]: true };
                              }
                            })}
                          >
                            ▼
                          </button>
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
                        <div style={{ position: 'relative', flex: '0 0 auto', width: '90px', overflow: 'hidden', borderRadius: '8px' }}>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Cena €"
                            value={linkedRecipe ? getRecipeTotalPrice(linkedRecipe.id) : opt.price}
                            onChange={e => updateOption(sectionKey, idx, 'price', parseFloat(e.target.value) || 0)}
                            style={{ 
                              ...styles.inputField, 
                              width: '100%',
                              minWidth: '0',
                              padding: linkedRecipe ? '0.7rem' : '0.7rem 26px 0.7rem 0.8rem',
                              boxSizing: 'border-box',
                              margin: 0,
                              boxShadow: '0 1px 4px #ffb3d122'
                            }}
                            readOnly={!!linkedRecipe}
                          />
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
                        </div>

                        {/* Small multiplier pill: click pill to edit, click row to set base */}
                        {diameterEnabled[sectionKey] && opt.id && (
                          <div
                            onClick={() => {
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
                                title="Klikni pre nastavenie základu alebo klikni na číslo pre edit"
                                onPointerDown={(e) => { e.stopPropagation(); }}
                              >
                                <span
                                  onPointerDown={(e) => { e.stopPropagation(); }}
                                  onClick={(e) => { e.stopPropagation(); setEditingMultiplierKey(`${sectionKey}:${opt.id}`); }}
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
                            onClick={() => removeOption(sectionKey, idx)}
                            style={styles.removeButton}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                    })}
                </div>
                <button
                  onClick={() => addOption(sectionKey)}
                  style={styles.addButton}
                >
                  + Pridať možnosť
                </button>
                <input
                  type="checkbox"
                  checked={Boolean(section.required)}
                  onChange={(e) => setSections(prev => ({
                    ...prev,
                    [sectionKey]: { ...prev[sectionKey], required: e.target.checked }
                  }))}
                  style={{ 
                    width: '22px', 
                    height: '22px', 
                    cursor: 'pointer', 
                    accentColor: currentColors.secondary,
                    marginLeft: '1rem', 
                    verticalAlign: 'middle',
                    filter: section.required ? 'none' : 'opacity(0.5) saturate(0.3)'
                  }}
                  title="Povinné pole"
                />

                {/* Toggle: enable diameter management for this section */}
                <input
                  type="checkbox"
                  checked={Boolean(diameterEnabled[sectionKey])}
                  onChange={async (e) => {
                    const enable = e.target.checked;
                    // create/delete multiplier rows
                    await toggleDiameterSection(sectionKey, enable, section.options || []);
                  }}
                  style={{ 
                    width: '22px', 
                    height: '22px', 
                    cursor: 'pointer', 
                    accentColor: currentColors.secondary,
                    marginLeft: '0.6rem', 
                    verticalAlign: 'middle'
                  }}
                  title="Spravovať priemery (nastaviť základ a násobky)"
                />
                <div style={styles.descriptionSection}>
                  <textarea
                    placeholder={"Spodný popis sekcie"}
                    value={section.description || ''}
                    onChange={(e) => updateSectionDescription(sectionKey, e.target.value)}
                    style={styles.descriptionField}
                  />
                </div>
              </section>
            );
          })}
          
          {/* Drag overlay (ghost of dragged section) */}
          {dragOverlayPos && dragOverlayRect && draggingKey && (
            <div style={{
              position: 'fixed',
              left: dragOverlayRect.left,
              width: dragOverlayRect.width,
              top: (dragOverlayPos.y - dragOffsetY),
              height: dragOverlayRect.height,
              pointerEvents: 'none',
              zIndex: 9999,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              transform: 'translateZ(0) scale(0.995)',
              background: '#fff',
              border: `2px solid ${currentColors.border}`,
              borderRadius: 10,
              padding: '0.5rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <div style={{ flex: 1, fontWeight: 700, color: currentColors.text }}>{keyToLabel[draggingKey] || draggingKey}</div>
            </div>
          )}

          {/* Button to add new section */}
          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <button
              onClick={addNewSection}
              style={{
                ...styles.addButton,
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
              }}
            >
              + Pridať sekciu
            </button>
          </div>
          </>
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
              {recipes.map((recipe) => (
                <div
                  key={recipe.id}
                  style={{
                    backgroundColor: '#fafafa',
                    border: `1px solid ${currentColors.border}`,
                    borderRadius: '8px',
                    padding: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: currentColors.text, fontSize: '1.2rem' }}>
                        {recipe.name}
                      </h3>
                      <p style={{ margin: 0, color: '#666', fontSize: '0.9rem', fontStyle: 'italic' }}>
                        {recipe.description}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteRecipe(recipe.id)}
                      style={{
                        background: '#ff6b6b',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                      }}
                    >
                      Zmazať
                    </button>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: currentColors.text, fontSize: '1rem' }}>
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
                      {recipeIngredientsByRecipe[recipe.id]?.map((ri) => (
                        <div
                          key={ri.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: currentColors.border,
                            padding: '0.75rem 1rem',
                            borderRadius: '6px',
                            fontSize: '0.95rem',
                          }}
                        >
                          <div>
                            <strong style={{ color: currentColors.text }}>{ri.ingredientName}</strong>
                            <span style={{ color: currentColors.text, marginLeft: '0.5rem', opacity: 0.8 }}>
                              {ri.quantity} {ri.unit}
                            </span>
                            <span style={{ marginLeft: '0.75rem', color: '#444', fontSize: '0.85rem' }}>
                              balenie {ri.packageSize} {ri.unit}
                            </span>
                            {ri.indivisible && (
                              <span style={{ marginLeft: '0.5rem', color: currentColors.secondary, fontWeight: 600 }}>
                                nedeliteľné
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ color: currentColors.secondary, fontWeight: 'bold' }}>
                              {getIngredientCost(ri).toFixed(2)} €
                            </span>
                            <button
                              onClick={() => removeRecipeIngredient(recipe.id, ri.id)}
                              style={{
                                background: currentColors.secondary,
                                border: 'none',
                                color: '#fff',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                padding: '0.25rem 0.5rem',
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
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
                              .includes(recipeSearchInputs[recipe.id].toLowerCase())
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
                                {ing.price.toFixed(2)} € / balenie {ing.packageSize || 1} {ing.unit}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      backgroundColor: currentColors.primary,
                      padding: '1rem',
                      borderRadius: '6px',
                      textAlign: 'right',
                      fontWeight: 'bold',
                      color: currentColors.text,
                      fontSize: '1.1rem',
                    }}
                  >
                    Celková cena receptu: {getRecipeTotalPrice(recipe.id).toFixed(2)} €
                  </div>
                </div>
              ))}
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
            <h2 style={{ ...styles.sectionTitle, color: currentColors.text }}>Ingrediencie</h2>
            <div style={styles.optionsContainer}>
              {ingredients.map((ing, idx) => (
                <div
                  key={ing.id ?? `new-${idx}`}
                  style={{
                    ...styles.optionBox,
                    backgroundColor: currentColors.primary,
                    border: `2px solid ${currentColors.border}`,
                    boxShadow: `0 2px 12px ${currentColors.border}55`,
                  }}
                >
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={ing.name}
                      onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                      style={{ ...styles.inputField, border: `1.5px solid ${currentColors.border}`, flex: 2, minWidth: '130px', maxWidth: '210px' }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Veľkosť balenia"
                      value={ing.packageSize}
                      onChange={(e) => updateIngredient(idx, 'packageSize', parseFloat(e.target.value) || 0)}
                      style={{ ...styles.inputField, border: `1.5px solid ${currentColors.border}`, width: '65px', minWidth: '55px', flex: 0 }}
                    />
                    <div style={{ position: 'relative', width: '70px', minWidth: '70px', maxWidth: '70px', flex: '0 0 auto', boxSizing: 'border-box', overflow: 'hidden', borderRadius: '8px' }}>
                      <select
                        value={ing.unit}
                        onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
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
                          cursor: 'pointer',
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
                      placeholder="Cena balenia €"
                      value={ing.price}
                      onChange={(e) => updateIngredient(idx, 'price', parseFloat(e.target.value) || 0)}
                      style={{ ...styles.inputField, border: `1.5px solid ${currentColors.border}`, width: '80px', minWidth: '65px', flex: 0 }}
                    />
                    <input
                      type="checkbox"
                      checked={ing.indivisible}
                      onChange={(e) => updateIngredient(idx, 'indivisible', e.target.checked)}
                      style={{ 
                        width: '22px', 
                        height: '22px', 
                        minWidth: '22px', 
                        maxWidth: '22px', 
                        cursor: 'pointer', 
                        accentColor: '#2e7d32', 
                        marginLeft: '2px', 
                        marginRight: '2px',
                        filter: ing.indivisible ? 'none' : 'opacity(0.5) saturate(0.3)',
                      }}
                    />
                    <button onClick={() => removeIngredient(idx)} style={{
                      ...styles.removeButton,
                      width: '42px',
                      backgroundColor: tabColors.Ingrediencie.secondary,
                      boxShadow: '0 1px 4px rgba(46, 125, 50, 0.25)'
                    }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addIngredient} style={{
              ...styles.addButton,
              backgroundColor: tabColors.Ingrediencie.secondary,
              color: '#fff',
              boxShadow: '0 2px 8px rgba(46, 125, 50, 0.3)'
            }}>+ Ďalší produkt</button>
          </section>
        )}

        {/* Tab Content: Navstevnost */}
        {activeTab === 'Navstevnost' && (
          <div style={styles.visitStatsTab}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={styles.visitStatsTitle}>📊 Návštevnosť stránky</h2>
              <button 
                onClick={loadVisitStats}
                disabled={loadingStats}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: loadingStats ? '#ccc' : '#64b5f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loadingStats ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                }}
              >
                {loadingStats ? 'Načítavam...' : '🔄 Obnoviť'}
              </button>
            </div>
            {loadingStats ? (
              <div style={styles.loadingText}>Načítavam štatistiky...</div>
            ) : (
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <div style={styles.statLabel}>Celkom návštev</div>
                  <div style={styles.statValue}>{visitStats.total}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.statLabel}>Posledných 24 hodín</div>
                  <div style={styles.statValue}>{visitStats.last24h}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.statLabel}>Unikátne IP adresy</div>
                  <div style={styles.statValue}>{visitStats.uniqueIps}</div>
                </div>
                {visitStats.byDay.length > 0 && (
                  <div style={styles.statCardWide}>
                    <div style={styles.statLabel}>Posledných 7 dní</div>
                    <div style={styles.daysList}>
                      {visitStats.byDay.map((item) => (
                        <div key={item.day} style={styles.dayItem}>
                          <span style={styles.dayDate}>{item.day}</span>
                          <span style={styles.dayCount}>{item.count} návštev</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {visitStats.byCity.length > 0 && (
                  <div style={styles.statCardWide}>
                    <div style={styles.statLabel}>🌍 Top mestá (Top 20)</div>
                    <div style={styles.daysList}>
                      {visitStats.byCity.map((item, idx) => {
                        const colors = ['#64b5f6', '#81c784', '#ffb74d', '#ff9fc4', '#ce93d8'];
                        const color = colors[idx % colors.length];
                        
                        return (
                          <div key={item.city} style={styles.cityItem}>
                            <div style={styles.cityInfo}>
                              <div style={styles.cityName}>#{idx + 1}. {item.city}</div>
                              <div style={styles.cityCountry}>{item.country}</div>
                            </div>
                            <div style={{
                              ...styles.cityBadge,
                              backgroundColor: color,
                            }}>
                              {item.count}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Removed no-op reference to `loadDiameterEnabledSections`.

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
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
    color: '#ffa9a9ff',
    fontSize: 'clamp(1.25rem, 3vw, 2rem)',
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
    maxWidth: '1200px',
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
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-start',
    padding: '3rem 2rem',
    backgroundColor: '#f5f5f5',
    minWidth: '320px',
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
    padding: '0.75rem 1rem',
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
    alignItems: 'center',
    marginBottom: '1.5rem',
    paddingBottom: '1rem',
    borderBottom: '2px solid #ffb3d1',
  } as React.CSSProperties,
  removeSectionButton: {
    padding: '0.5rem 0.7rem',
    backgroundColor: '#ff9fc4',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1.1rem',
    boxShadow: '0 1px 4px #ffb3d122',
    transition: 'background 0.2s',
    fontWeight: 'bold',
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
    flexWrap: 'wrap' as const,
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
    color: '#333',
    fontWeight: '500',
    boxShadow: '0 1px 4px #ffb3d122',
    transition: 'border 0.2s',
  } as React.CSSProperties,
  descriptionField: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box' as const,
    padding: '1rem',
    borderRadius: '10px',
    border: '2px solid #ffb3d1',
    fontSize: '0.95rem',
    fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    minHeight: '80px',
    resize: 'vertical' as const,
    overflowX: 'hidden' as const,
    backgroundColor: '#fff',
    color: '#333',
    boxShadow: '0 2px 8px #ffb3d122',
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
  descriptionBox: {
    display: 'flex',
    gap: '0.5rem',
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
  descriptionSection: {
    marginTop: '1rem',
  } as React.CSSProperties,
  saveSection: {
    marginTop: '2rem',
    padding: '1.5rem',
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e6e6e9',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
    alignItems: 'center',
  } as React.CSSProperties,
  saveButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
  } as React.CSSProperties,
  saveMessage: {
    textAlign: 'center' as const,
    fontSize: '1rem',
    margin: 0,
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
  emptyTab: {
    padding: '3rem 1rem',
    textAlign: 'center',
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e6e6e9',
    marginTop: '2rem',
  } as React.CSSProperties,
  emptyTabText: {
    color: '#6c757d',
    fontSize: '1.1rem',
    margin: 0,
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
    flex: 1,
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
    statsContainer: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '1rem',
      marginTop: '1rem',
    } as React.CSSProperties,
    statBox: {
      padding: '1rem',
      backgroundColor: '#6b96c2ff',
      borderRadius: '8px',
      border: '1px solid #e0e6f0',
    } as React.CSSProperties,
    statBoxSingle: {
      padding: '0.5rem',
      backgroundColor: '#f8f9fa',
      borderRadius: '6px',
      border: '1px solid #e0e6f0',
    } as React.CSSProperties,
};
