import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import EmailModal from '../components/EmailModal';
import { supabase } from '../lib/supabase';

export function HomePage() {
  const { slug } = useParams<{ slug: string }>();
  // bakeryId sa načíta podľa slug — null = dáta ešte nie sú filtrované (pred migráciou)
  const [bakeryId, setBakeryId] = useState<string | null>(null);
  interface SectionOption {
    id: string;
    section: string;
    name: string;
    price: number;
    description: string | null;
    sort_order: number;
    linkedRecipeId?: string | null;
  }

  const [loading, setLoading] = useState(true);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderSuccess, setOrderSuccess] = useState<boolean>(false);
  // Admin emails loading is paused until notifications are wired

  interface CartItem {
    id: string;
    // All selections stored dynamically by section key -> option name
    dynamicSelections: Record<string, string>;
    reward: number;
    totalPrice: number;
    quantity: number;
    eventName: string;
  }
  const [cart, setCart] = useState<CartItem[]>([]);

  // Keep a ref of cart so effects that should only react to `activeItemId`
  // don't need to include `cart` in their dependency array (prevents loop).
  const cartRef = useRef<CartItem[]>(cart);
  useEffect(() => { cartRef.current = cart; }, [cart]);

  // State pre dynamické sekcie (nové sekcie pridané v AdminPanel)
  interface DynamicSectionData {
    key: string;
    label: string;
    options: SectionOption[];
    description: string;
    isOpen: boolean;
    selectedId: string | null;
    required?: boolean;
    hidePrice?: boolean;
    layout?: string;
  }
  const [dynamicSections, setDynamicSections] = useState<DynamicSectionData[]>([]);
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [titleColWidth, setTitleColWidth] = useState(160);

  useEffect(() => {
    if (dynamicSections.length === 0) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '600 14px system-ui, Avenir, Helvetica, Arial, sans-serif';
    let maxW = 140;
    for (const s of dynamicSections.filter(s => s.layout !== 'grid')) {
      const w = ctx.measureText(s.label + (s.required ? ' *' : '')).width;
      if (w > maxW) maxW = w;
    }
    setTitleColWidth(Math.ceil(maxW) + 20);
  }, [dynamicSections]);
  const [diameterMultipliersMap, setDiameterMultipliersMap] = useState<Record<string, number>>({});
  const [multByOptionId, setMultByOptionId] = useState<Record<string, number>>({});
  
  const [recipesByName, setRecipesByName] = useState<Record<string,string>>({});
  const [multiplyEnabled, setMultiplyEnabled] = useState<Record<string, boolean>>(() => {
    try {
      const stored = window.localStorage.getItem('upec_multiply_enabled');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  // Keep multiplyEnabled in sync when AdminPanel changes localStorage from another tab/window
  // Close custom dropdown when clicking outside
  useEffect(() => {
    if (!openDropdownKey) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown-key]') && !target.closest('#dropdown-portal')) {
        setOpenDropdownKey(null);
        setDropdownRect(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdownKey]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'upec_multiply_enabled' && e.newValue) {
        try { setMultiplyEnabled(JSON.parse(e.newValue)); } catch {}
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Helper: find an applicable diameter multiplier for a given option (and optional cart item).
  function findApplicableDiameterMultiplier(targetSectionKey: string, item?: CartItem) {
    // If násobenie is disabled for this section, return 1 (no scaling)
    if (multiplyEnabled[targetSectionKey] === false) return 1;
    const managed = Array.from(new Set(Object.keys(diameterMultipliersMap).map(k => k.split(':')[0])));
    
    for (const m of managed) {
      if (m === targetSectionKey) continue; // don't use the same section as the option itself
      // item-level selection takes precedence
      let diaOptionId: string | undefined;
      if (item) {
        const itemSelName = item.dynamicSelections?.[m];
        if (itemSelName) {
          const sec = dynamicSections.find(d => d.key === m);
          diaOptionId = sec?.options.find(op => op.name === itemSelName)?.id;
        }
      }
      // otherwise use global selected id for that section
      if (!diaOptionId) diaOptionId = dynamicSections.find(d => d.key === m)?.selectedId || undefined;
      if (diaOptionId) {
        const lookupKey = `${m}:${diaOptionId}`;
        let mult = diameterMultipliersMap[lookupKey];
        // Fallback: try to match by option id suffix in case section keys don't align
        if (!mult) {
          const entry = Object.entries(diameterMultipliersMap).find(([k]) => k.endsWith(`:${diaOptionId}`));
          if (entry) {
            mult = entry[1];
          }
        }
        if (mult) return mult;
        // Final fallback: direct option-id lookup
        const byOptMult = multByOptionId[diaOptionId];
        if (byOptMult) {
          return byOptMult;
        }
      }
    }
    return 1;
  }

  
  const [showRequiredHint, setShowRequiredHint] = useState<boolean>(false);

  // When active cart item changes, restore UI selections for dynamic sections
  useEffect(() => {
    if (!activeItemId) {
      // clear selections when no active item — re-open all collapsed sections
      setDynamicSections(prev => prev.map(ds => ({
        ...ds,
        selectedId: null,
        isOpen: ds.layout !== 'grid',
      })));
      return;
    }
    // Use cartRef to avoid adding `cart` to deps and creating a feedback loop
    const item = cartRef.current.find(it => it.id === activeItemId);
    if (!item) return;
    // Map stored selection names back to option ids for each dynamic section
    setDynamicSections(prev => prev.map(ds => {
      const selName = item.dynamicSelections?.[ds.key];
      if (!selName) return { ...ds, selectedId: null, isOpen: ds.layout !== 'grid' };
      const found = ds.options.find(o => o.name === selName);
      const hasSelection = Boolean(found);
      return {
        ...ds,
        selectedId: found ? found.id : null,
        // collapse section if it has a selection, open it if not
        isOpen: !hasSelection,
      };
    }));

  }, [activeItemId]);

  // Vypočet celkovej ceny
  // totalPrice (global) no longer used; item totals computed per cart item

  useEffect(() => {
    async function init() {
        // Načítaj bakeryId podľa slug z URL
        let resolvedBakeryId: string | null = null;
        if (slug) {
          const { data: bakery } = await supabase
            .from('bakeries')
            .select('id')
            .eq('slug', slug)
            .eq('is_active', true)
            .maybeSingle();
          if (bakery?.id) {
            resolvedBakeryId = bakery.id;
            setBakeryId(bakery.id);
          } else {
            // bakeries tabuľka ešte neexistuje (pred migráciou) — pokračuj bez filtra
            setBakeryId(null);
          }
        }

        const sections = await loadAllSections(resolvedBakeryId);
        await loadDiameterMultipliers(sections, resolvedBakeryId);
        await loadRecipes(resolvedBakeryId);
        await loadAdminEmails();
    }
    init();

    // Live updates: subscribe to changes on section_meta and section_options
    const channel = supabase.channel('sections-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'section_meta' }, () => {
        loadAllSections().then(secs => loadDiameterMultipliers(secs as any).catch(() => {}));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'section_options' }, () => {
        loadAllSections().then(secs => loadDiameterMultipliers(secs as any).catch(() => {}));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diameter_multipliers' }, () => {
        loadDiameterMultipliers();
      })
      .subscribe();

    // Log visit (fire-and-forget)
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const endpoint = `${baseUrl}/functions/v1/log-visit`;
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Provide authorization to avoid 401 from Edge Function
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          path: window.location.pathname,
          userAgent: navigator.userAgent,
        })
      }).catch(() => {});
    } catch (_) {
      // silent
    }

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, []);

  async function loadDiameterMultipliers(sectionsParam?: DynamicSectionData[], bakeryIdParam?: string | null) {
    try {
      let query = supabase
        .from('diameter_multipliers')
        .select('section_key, option_id, multiplier');
      const bid = bakeryIdParam ?? bakeryId;
      if (bid) query = (query as any).eq('bakery_id', bid);
      const { data, error } = await query;
      if (error) throw error;
      const map: Record<string, number> = {};
      // Remap DB section_key to the `dynamicSections` keys where possible.
      const knownKeys = new Map<string,string>();
      const sectionsToUse = sectionsParam || dynamicSections;
      sectionsToUse.forEach(ds => knownKeys.set(ds.key.toLowerCase(), ds.key));

      // small helper: levenshtein distance for fuzzy matching (for typos like 'primer' vs 'priemer')
      function levenshtein(a: string, b: string) {
        const al = a.length, bl = b.length;
        if (al === 0) return bl;
        if (bl === 0) return al;
        const dp = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
        for (let i = 0; i <= al; i++) dp[i][0] = i;
        for (let j = 0; j <= bl; j++) dp[0][j] = j;
        for (let i = 1; i <= al; i++) {
          for (let j = 1; j <= bl; j++) {
            const cost = a[i-1] === b[j-1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
          }
        }
        return dp[al][bl];
      }
      (data || []).forEach((r: any) => {
        if (r?.section_key && r?.option_id) {
          const rawKey = String(r.section_key || '').trim();
          const normalized = rawKey.toLowerCase();
          let useKey = knownKeys.get(normalized) || rawKey;
          if (!knownKeys.has(normalized)) {
            // fuzzy find closest known key
            let best: string | null = null;
            let bestScore = Infinity;
            for (const k of knownKeys.keys()) {
              const score = levenshtein(k, normalized);
              if (score < bestScore) { bestScore = score; best = k; }
            }
            if (best && bestScore <= 2) {
              useKey = knownKeys.get(best) || rawKey;
              
            }
          }
          const mapKey = `${useKey}:${r.option_id}`;
          map[mapKey] = r.multiplier ?? 1;
          if (useKey !== rawKey) {
            
          }
        }
      });
      setDiameterMultipliersMap(map);
      // also set direct map by option id for reliable lookup
      const byOpt: Record<string, number> = {};
      (data || []).forEach((r: any) => { if (r?.option_id) byOpt[String(r.option_id)] = r.multiplier ?? 1; });
      setMultByOptionId(byOpt);
      
    } catch (err) {
      console.error('Load diameter multipliers failed:', err);
    }
  }

  async function loadRecipes(bakeryIdParam?: string | null) {
    try {
      let query = supabase.from('recipes').select('id, name');
      const bid = bakeryIdParam ?? bakeryId;
      if (bid) query = (query as any).eq('bakery_id', bid);
      const { data, error } = await query;
      if (error) throw error;
      const map: Record<string,string> = {};
      (data || []).forEach((r: any) => { if (r?.name) map[String(r.name)] = r.id; });
      setRecipesByName(map);
      
    } catch (e) {
      console.error('loadRecipes failed', e);
    }
  }

  async function loadAllSections(bakeryIdParam?: string | null) {
    try {
      const bid = bakeryIdParam ?? bakeryId;
      let optsQuery = supabase
        .from('section_options')
        .select('*')
        .order('section', { ascending: true })
        .order('sort_order', { ascending: true });
      if (bid) optsQuery = (optsQuery as any).eq('bakery_id', bid);
      const { data, error } = await optsQuery;

      if (error) throw error;

      const opts = data || [];

      // Fetch bottom descriptions from section_meta
      // Try to read sort_order + name when available
      let meta: any[] | null = null;
      {
        // Helper to apply optional bakery_id filter
        const withBid = (q: any) => bid ? q.eq('bakery_id', bid) : q;

        const { data: d1, error: e1 } = await withBid(supabase
          .from('section_meta')
          .select('section, description, required, sort_order, name, hide_price, multiply_enabled, layout'));
        if (!e1) {
          meta = d1 as any[] | null;
        } else {
          // Fallback: try without name column
          const { data: d2, error: e2 } = await withBid(supabase
            .from('section_meta')
            .select('section, description, required, sort_order, hide_price, multiply_enabled, layout'));
          if (!e2) {
            meta = d2 as any[] | null;
          } else {
            const { data: d3, error: e3 } = await withBid(supabase
              .from('section_meta')
              .select('section, description, required, hide_price, multiply_enabled, layout'));
            if (!e3) {
              meta = (d3 as any[] | null) || [];
            } else {
              // Oldest DB without multiply_enabled
              const { data: d4, error: e4 } = await withBid(supabase
                .from('section_meta')
                .select('section, description, required, hide_price'));
              if (e4) throw e4;
              meta = (d4 as any[] | null) || [];
            }
          }
        }
      }
      const metaRows: Array<{ section: string; description: string; required?: boolean; name?: string; hide_price?: boolean; multiply_enabled?: boolean; layout?: string }> = (meta || []) as any;
      const descMap: Record<string, string> = {};
      const nameMap: Record<string, string> = {};
      const reqMap: Record<string, boolean> = {};
      const hideMap: Record<string, boolean> = {};
      const layoutMap: Record<string, string> = {};
      const multiplyDbMap: Record<string, boolean> = {};
      let hasMultiplyColumn = false;
      metaRows.forEach(m => {
        if (m?.section) {
          descMap[m.section] = m.description || '';
          nameMap[m.section] = (m as any).name || '';
          reqMap[m.section] = Boolean((m as any).required);
          hideMap[m.section] = Boolean((m as any).hide_price);
          if (m.layout) layoutMap[m.section] = m.layout;
          if (typeof m.multiply_enabled !== 'undefined') {
            hasMultiplyColumn = true;
            multiplyDbMap[m.section] = m.multiply_enabled !== false;
          }
        }
      });
      // Use DB values for multiply_enabled when available; fall back to localStorage
      if (hasMultiplyColumn) {
        setMultiplyEnabled(prev => ({ ...prev, ...multiplyDbMap }));
      }

      const isPlaceholder = (s: string | undefined | null) => {
        const t = (s || '').trim().toLowerCase();
        return !t || t === 'spodny popis sekcie' || t === 'spodný popis sekcie';
      };

      // Postav VŠETKY dynamické sekcie zo zjednotenia kľúčov (meta + options), VRÁTANE logistics
      const keysFromMeta = Object.keys(descMap);
      const keysFromOpts = [...new Set(opts.map(o => o.section))];
      let unionKeys = Array.from(new Set([...keysFromMeta, ...keysFromOpts]));

      // If meta contains sort_order values, prefer that ordering
      const sortOrderMap: Record<string, number> = {};
      (meta || []).forEach((m: any) => {
        if (m?.section && typeof m.sort_order !== 'undefined' && m.sort_order !== null) {
          sortOrderMap[m.section] = Number(m.sort_order) || 0;
        }
      });
      if (Object.keys(sortOrderMap).length > 0) {
        unionKeys = unionKeys.sort((a, b) => {
          const aVal = typeof sortOrderMap[a] !== 'undefined' ? sortOrderMap[a] : 99999;
          const bVal = typeof sortOrderMap[b] !== 'undefined' ? sortOrderMap[b] : 99999;
          if (aVal !== bVal) return aVal - bVal;
          return a.localeCompare(b, 'sk', { sensitivity: 'base' });
        });
      } else {
        // If DB has no sort_order, check for localStorage fallback written by AdminPanel
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const stored = window.localStorage.getItem('upec_section_order');
            if (stored) {
              const arr = JSON.parse(stored);
              if (Array.isArray(arr) && arr.length) {
                // Keep only keys that exist now, preserve order from stored array
                const filtered = arr.filter((k: string) => unionKeys.includes(k));
                // Append any new keys not in stored array
                const remaining = unionKeys.filter(k => !filtered.includes(k));
                unionKeys = [...filtered, ...remaining];
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }

      const dynamicSectionsData: DynamicSectionData[] = unionKeys.map(key => {
        const sectionOpts = opts.filter(o => o.section === key).map((o: any) => ({
          id: o.id,
          section: o.section,
          name: o.name,
          price: Number(o.price) || 0,
          description: o.description || null,
          sort_order: o.sort_order || 0,
          linkedRecipeId: o.linked_recipe_id || o.linkedRecipeId || null,
        }));
        const defaultLabel = key.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const metaName = nameMap[key];
        const metaDesc = descMap[key];
        // Label: prefer name column, fall back to description (legacy), then generate from key
        const label = metaName || (!isPlaceholder(metaDesc) ? metaDesc : defaultLabel);
        return {
          key,
          label,
          options: sectionOpts,
          description: metaDesc || '',
          isOpen: (layoutMap[key] || 'list') !== 'grid',
          selectedId: null,
          required: Boolean(reqMap[key]),
          hidePrice: Boolean(hideMap[key]),
          layout: layoutMap[key] || 'list',
        };
      });
      // Ensure uniqueness while preserving the ordering determined above (DB sort_order or localStorage fallback)
      const uniqByKey = Array.from(new Map(dynamicSectionsData.map(ds => [ds.key, ds])).values());
      setDynamicSections(uniqByKey);
      return uniqByKey;
    } catch (err) {
      console.error('Chyba pri načítaní sekcií:', err);
    } finally {
      setLoading(false);
    }
    return [];
  }

  async function loadAdminEmails() {
    // No-op for now; notifications will be wired later
    return;
  }

  // Remove cart items that are empty (no dynamic selections). Keep the optional exceptId.
  function pruneEmptyCartItems(exceptId?: string) {
    setCart(prev => {
      const filtered = prev.filter(it => {
        if (exceptId && it.id === exceptId) return true;
        const keys = Object.keys(it.dynamicSelections || {});
        return keys.length > 0;
      });
      return filtered;
    });
  }

  // Note: recipes are not required here; diameter-managed sections are detected from
  // `diameter_multipliers` entries loaded into `diameterMultipliersMap`.

  // Selection handlers with price updates
  // Legacy selection handlers removed; dynamic sections use upsertCartDynamic

  function onSelectDynamic(key: string, optionId: string) {
    // Build the new dynamicSections array synchronously so we can use it for immediate total computation
    const newDynamicSections = dynamicSections.map(ds => {
      if (ds.key !== key) return ds;
      // Auto-collapse the section after picking for all layouts
      return { ...ds, selectedId: optionId, isOpen: false };
    });
    setDynamicSections(newDynamicSections);
    
    const section = newDynamicSections.find(ds => ds.key === key);
    const opt = section?.options.find(o => o.id === optionId);
    
    if (opt) {
      upsertCartDynamic(key, opt.name, newDynamicSections);
      // Recompute all cart items immediately using updated sections (ensures multipliers apply right away)
      setCart(prev => prev.map(it => ({ ...it, totalPrice: computeItemTotalWithSections(it, newDynamicSections) })));
    }
    
    // Nezmeň showRequiredHint — nech zvýraznenie zostane aktívne, kým nie sú vyplnené všetky povinné polia
  }

  function computeItemTotal(it: CartItem) {
    // Compute total where only selections from sections present in
    // `diameterMultipliersMap` are scaled. Other selections remain unscaled.
    let total = 0;

    for (const [secKey, name] of Object.entries(it.dynamicSelections || {})) {
      const ds = dynamicSections.find(d => d.key === secKey);
      if (!ds) continue;
    const opt = ds.options.find(o => o.name === name);
    const price = ds.hidePrice ? 0 : (opt?.price ?? 0);

      // Skip multiplier if this section has násobenie disabled
      if (multiplyEnabled[secKey] === false) {
        total += price;
        continue;
      }

      // Apply diameter multiplier to ALL sections with násobenie aktívne
      let appliedMult = 1;
      const managed = Array.from(new Set(Object.keys(diameterMultipliersMap).map(k => k.split(':')[0])));
      for (const m of managed) {
        if (m === secKey) continue;
        const itemSelName = it.dynamicSelections?.[m];
        let diaOptionId: string | undefined;
        if (itemSelName) {
          const sec = dynamicSections.find(d => d.key === m);
          diaOptionId = sec?.options.find(op => op.name === itemSelName)?.id;
        }
        if (!diaOptionId) {
          diaOptionId = dynamicSections.find(d => d.key === m)?.selectedId || undefined;
        }
        if (diaOptionId) {
          let mult = diameterMultipliersMap[`${m}:${diaOptionId}`];
          if (!mult) {
            const entry = Object.entries(diameterMultipliersMap).find(([k]) => k.endsWith(`:${diaOptionId}`));
            if (entry) { mult = entry[1]; }
          }
          if (!mult) {
            const byOptMult = multByOptionId[diaOptionId];
            if (byOptMult) { mult = byOptMult; }
          }
          if (mult) { appliedMult = mult; break; }
        }
      }

      total += price * appliedMult;
    }

    return total + (it.reward || 0);
  }

  // Recompute cart totals whenever multipliers, sections or multiply-enabled map changes
  useEffect(() => {
    if (!cart || cart.length === 0) return;
    setCart(prev => prev.map(it => ({ ...it, totalPrice: computeItemTotal(it) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diameterMultipliersMap, dynamicSections, multiplyEnabled]);

  // addCake is no longer used directly; '+ ďalšia torta' starts a fresh item

  function computeItemTotalWithSections(it: CartItem, sections: DynamicSectionData[]) {
    let total = 0;
    for (const [secKey, name] of Object.entries(it.dynamicSelections || {})) {
      const ds = sections.find(d => d.key === secKey);
      if (!ds) continue;
      const opt = ds.options.find(o => o.name === name);
      if (!opt) continue;
      let price = ds.hidePrice ? 0 : (opt.price || 0);
      // Skip multiplier if this section has násobenie disabled
      if (multiplyEnabled[secKey] === false) {
        total += price;
        continue;
      }

      // Apply diameter multiplier to ALL sections with násobenie aktívne
      let appliedMult = 1;
      const managed = Array.from(new Set(Object.keys(diameterMultipliersMap).map(k => k.split(':')[0])));
      for (const m of managed) {
        if (m === secKey) continue;
        let diaOptionId: string | undefined;
        const itemSelName = it.dynamicSelections?.[m];
        if (itemSelName) {
          const sec = sections.find(d => d.key === m);
          diaOptionId = sec?.options.find(op => op.name === itemSelName)?.id;
        }
        if (!diaOptionId) diaOptionId = sections.find(d => d.key === m)?.selectedId || undefined;
        if (diaOptionId) {
          let mult = diameterMultipliersMap[`${m}:${diaOptionId}`];
          if (!mult) {
            const entry = Object.entries(diameterMultipliersMap).find(([k]) => k.endsWith(`:${diaOptionId}`));
            if (entry) { mult = entry[1]; }
          }
          if (!mult) {
            const byOptMult = multByOptionId[diaOptionId];
            if (byOptMult) { mult = byOptMult; }
          }
          if (mult) { appliedMult = mult; break; }
        }
      }
      price = price * appliedMult;
      total += price;
    }
    return total + (it.reward || 0);
  }

  function upsertCartDynamic(sectionKey: string, optionName: string, sectionsForCompute?: DynamicSectionData[]) {
    setCart(prev => {
      // ensure target item
      let targetId = activeItemId;
      if (targetId && !prev.some(it => it.id === targetId)) targetId = null;
      let next = [...prev];
      if (!targetId) {
        const newItem: CartItem = {
          id: Date.now().toString(),
          dynamicSelections: {},
          reward: 0,
          totalPrice: 0,
          quantity: 1,
          eventName: `Torta #${prev.length + 1}`,
        };
        next = [...prev, newItem];
        targetId = newItem.id;
        setActiveItemId(targetId);
        setIsCartOpen(true);
      }
      next = next.map(it => {
        if (it.id !== targetId) return it;
        const copy: CartItem = { ...it };
        copy.dynamicSelections = { ...(copy.dynamicSelections || {}) };
        copy.dynamicSelections[sectionKey] = optionName || '';
        const sectionsRef = sectionsForCompute || dynamicSections;
        copy.totalPrice = computeItemTotalWithSections(copy, sectionsRef);
        return copy;
      });
      return next;
    });
  }

  function removeDynamicPart(itemId: string, sectionKey: string) {
    // Build updated dynamicSections reflecting the UI change so total computation is accurate
    const updatedSections = dynamicSections.map(ds =>
      ds.key === sectionKey ? { ...ds, selectedId: null, isOpen: true } : ds
    );
    setDynamicSections(updatedSections);
    setCart(prev => {
      const updated = prev.map(it => {
        if (it.id !== itemId) return it;
        const copy: CartItem = { ...it };
        if (copy.dynamicSelections) delete copy.dynamicSelections[sectionKey];
        copy.totalPrice = computeItemTotalWithSections(copy, updatedSections);
        return copy;
      });
      const cleaned = updated.filter(it => {
        const hasDyn = it.dynamicSelections && Object.values(it.dynamicSelections).some(Boolean);
        return hasDyn;
      });
      if (activeItemId && !cleaned.some(it => it.id === activeItemId)) {
        setActiveItemId(cleaned.length ? cleaned[0].id : null);
      }
      return cleaned;
    });
    // UI selection already updated above
  }

  async function handleCheckoutWithData(name: string, email: string) {
    if (cart.length === 0) return;
    // Check all required sections for every cake
    const requiredSections = dynamicSections.filter(ds => ds.required);
    const missingItems = cart.filter(it =>
      requiredSections.some(ds => !it.dynamicSelections[ds.key])
    );
    if (missingItems.length > 0) {
      setShowRequiredHint(true);
      alert('Prosím, vyplňte všetky povinné polia pre každú tortu.');
      return;
    }

    const total = cart.reduce((sum, it) => sum + (it.totalPrice * it.quantity), 0);
    const items = cart.map((it) => ({
      eventName: it.eventName,
      quantity: it.quantity,
      selections: it.dynamicSelections,
      reward: it.reward,
      unitPrice: it.totalPrice,
      lineTotal: it.totalPrice * it.quantity,
    }));
    try {
      setOrderSuccess(false);
      setIsSubmittingOrder(true);
      // Uložiť objednávku do DB
      const { error } = await supabase
        .from('orders')
        .insert([
          {
            email,
            items,
            total,
          },
        ]);
      if (error) throw error;

      // Zavolať Edge Function pre odoslanie emailov
      const emailItems = items.map(it => ({
        name: it.eventName,
        qty: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
      }));

      // Generate PDF for email attachment (does not change Export-to-PDF UX)
      let pdfBase64: string | null = null;
      let pdfFilename: string | null = null;
      try {
        pdfBase64 = await generatePdfBase64ForEmail();
        if (pdfBase64) {
          pdfFilename = `order-${Date.now()}.pdf`;
        }
      } catch (pe) {
        pdfBase64 = null;
        pdfFilename = null;
      }

      const { error: fnError } = await supabase.functions.invoke('send-order-email', {
        body: {
          customerEmail: email,
          customerName: name,
          items: emailItems,
          total,
          pdfBase64,
          pdfFilename,
          bakeryId: bakeryId ?? undefined,
        },
      });

      if (fnError) {
        alert(`Objednávka bola uložená, ale email sa nepodarilo odoslať: ${fnError.message}`);
      }
      setIsSubmittingOrder(false);
      setOrderSuccess(true);
      setIsEmailModalOpen(false);
      setCart([]);
      setIsCartOpen(false);
    } catch (e) {
      console.error('Supabase insert error:', e);
      const msg = (e as any)?.message || (e as any)?.error || 'Nepodarilo sa uložiť objednávku.';
      alert(msg);
      setIsSubmittingOrder(false);
    }
  }

  // removed unused cart modification helpers (quantity/name)

  async function exportCartToPDF() {
    if (cart.length === 0) {
      alert('Košík je prázdny – nie je čo exportovať.');
      return;
    }
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;

      // Ensure Unicode font (NotoSans with latin-ext for č, ď, ľ, ň ...)
      async function ensureFont() {
        // 1. Try local DejaVuSans (user should place TTF at public/fonts/DejaVuSans.ttf)
        const localPath = '/fonts/DejaVuSans.ttf';
        const localBoldPath = '/fonts/DejaVuSans-Bold.ttf';
        const tryLoad = async (url: string, vfsName: string, fontName: string) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const buf = await res.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(buf);
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
          }
          doc.addFileToVFS(vfsName, binary);
          try {
            (doc as any).addFont(vfsName, fontName, 'normal', 'Identity-H');
          } catch (_) {
            doc.addFont(vfsName, fontName, 'normal');
          }
          doc.setFont(fontName, 'normal');
          return fontName;
        };
        const tryLoadBold = async (url: string, vfsName: string, fontName: string) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const buf = await res.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(buf);
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
          }
          doc.addFileToVFS(vfsName, binary);
          try {
            (doc as any).addFont(vfsName, fontName, 'bold', 'Identity-H');
          } catch (_) {
            doc.addFont(vfsName, fontName, 'bold');
          }
        };
        try {
          const name = await tryLoad(localPath, 'dejavu.ttf', 'dejavu');
          // load bold variant if available
          try { await tryLoadBold(localBoldPath, 'dejavu-bold.ttf', 'dejavu'); } catch {}
          return name;
        } catch (e) {
          console.warn('Local DejaVuSans.ttf not found, falling back to CDN NotoSans.', e);
        }
        // 2. Fallback NotoSans
        try {
          const name = await tryLoad('https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosans/NotoSans-Regular.ttf', 'notosans.ttf', 'notosans');
          return name;
        } catch (e2) {
          console.warn('NotoSans fallback zlyhal, použije sa helvetica.', e2);
          doc.setFont('helvetica', 'normal');
          return 'helvetica';
        }
      }

      const activeFont = await ensureFont();

      // Header
      doc.setFillColor(255, 200, 214);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(91, 17, 51);
      doc.setFontSize(22);
      if (activeFont !== 'helvetica') doc.setFont(activeFont, 'bold'); else doc.setFont('helvetica', 'bold');
      doc.text('Tortová kalkulačka', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(12);
      doc.setTextColor(120, 70, 90);
      doc.text('Zhrnutie objednávky', pageWidth / 2, 28, { align: 'center' });

      let y = 55;

      // Build price lookup maps for per-component pricing (all dynamic)
      const priceBy: Record<string, Map<string, number>> = {};
      dynamicSections.forEach(ds => {
        priceBy[ds.key] = new Map(ds.options.map(o => [o.name, o.price]));
      });
      const getP = (section: string, name?: string | null) => (name ? (priceBy[section]?.get(name) ?? 0) : 0);

      cart.forEach((item, idx) => {
        if (y > 250) { doc.addPage(); y = 25; }

        // Item header background
        doc.setFillColor(240, 247, 255);
        doc.rect(15, y - 8, pageWidth - 30, 14, 'F');
        doc.setTextColor(0, 86, 179);
        doc.setFontSize(13);
        doc.text('Tvoja dokonalá torta', 20, y);
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        doc.text(item.eventName, pageWidth - 20, y, { align: 'right' });
        y += 10;

        // Details with prices per component (apply diameter multipliers for recipe-linked options)
        const details = Object.entries(item.dynamicSelections || {}).map(([secKey, name]) => {
          const ds = dynamicSections.find(d => d.key === secKey);
          const label = (ds?.label || secKey.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')) + ':';
          const basePrice = getP(secKey, name);
          const opt = ds?.options.find(o => o.name === name);
          const isLinked = Boolean(opt?.linkedRecipeId || recipesByName[opt?.name || '']);
          let price = basePrice;
          if (isLinked) {
            const appliedMult = findApplicableDiameterMultiplier(secKey, item) || 1;
            price = basePrice * appliedMult;
          }
          return { label, value: name, price };
        });
        if (item.reward > 0) {
          details.push({ label: 'Odmena pre tvorcu:', value: '', price: item.reward });
        }

        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);

        details.forEach(d => {
          if (y > 270) { doc.addPage(); y = 25; }
          doc.setFont(activeFont !== 'helvetica' ? activeFont : 'helvetica', 'normal');
          doc.setTextColor(30, 30, 30);
          doc.text(d.label, 25, y);
          if (d.value) doc.text(d.value, 65, y);
          doc.setFont(activeFont !== 'helvetica' ? activeFont : 'helvetica', 'bold');
          doc.setTextColor(15, 90, 80);
          doc.text(`${d.price.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' });
          y += 6;
        });

        // Separator
        y += 4;
        if (idx < cart.length - 1) {
          doc.setDrawColor(220, 220, 220);
          doc.line(20, y, pageWidth - 20, y);
          y += 8;
        }
      });

      // Grand total band
      const grandTotal = cart.reduce((sum, it) => sum + (it.totalPrice * it.quantity), 0).toFixed(2);
      if (y > 245) { doc.addPage(); y = 25; }
      doc.setFillColor(255, 143, 177);
      doc.rect(15, y, pageWidth - 30, 18, 'F');
      doc.setFont(activeFont !== 'helvetica' ? activeFont : 'helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(91, 17, 51);
      doc.text('Spolu všetky položky:', 20, y + 12);
      doc.setFontSize(14);
      doc.text(`${grandTotal} €`, pageWidth - 20, y + 12, { align: 'right' });

      // Footer page numbers
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Strana ${i} z ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }

      doc.save('tortova-objednavka.pdf');
    } catch (e) {
      console.error(e);
      alert('Nepodarilo sa vytvoriť PDF (font?). Skúste znova.');
    }
  }

  // Generate PDF as base64 for attaching to emails during checkout.
  async function generatePdfBase64ForEmail() {
    if (cart.length === 0) return null;
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;

      // reuse same font logic as exportCartToPDF to preserve appearance
      async function ensureFont() {
        const localPath = '/fonts/DejaVuSans.ttf';
        const localBoldPath = '/fonts/DejaVuSans-Bold.ttf';
        const tryLoad = async (url: string, vfsName: string, fontName: string) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const buf = await res.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(buf);
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
          }
          doc.addFileToVFS(vfsName, binary);
          try { (doc as any).addFont(vfsName, fontName, 'normal', 'Identity-H'); } catch (_) { doc.addFont(vfsName, fontName, 'normal'); }
          doc.setFont(fontName, 'normal');
          return fontName;
        };
        const tryLoadBold = async (url: string, vfsName: string, fontName: string) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const buf = await res.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(buf);
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
          }
          doc.addFileToVFS(vfsName, binary);
          try { (doc as any).addFont(vfsName, fontName, 'bold', 'Identity-H'); } catch (_) { doc.addFont(vfsName, fontName, 'bold'); }
        };
        try {
          const name = await tryLoad(localPath, 'dejavu.ttf', 'dejavu');
          try { await tryLoadBold(localBoldPath, 'dejavu-bold.ttf', 'dejavu'); } catch {}
          return name;
        } catch (e) {
          console.warn('Local DejaVuSans.ttf not found, falling back to CDN NotoSans.', e);
        }
        try {
          const name = await tryLoad('https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosans/NotoSans-Regular.ttf', 'notosans.ttf', 'notosans');
          return name;
        } catch (e2) {
          console.warn('NotoSans fallback zlyhal, použije sa helvetica.', e2);
          doc.setFont('helvetica', 'normal');
          return 'helvetica';
        }
      }

      const activeFont = await ensureFont();

      // Header
      doc.setFillColor(255, 200, 214);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(91, 17, 51);
      doc.setFontSize(22);
      if (activeFont !== 'helvetica') doc.setFont(activeFont, 'bold'); else doc.setFont('helvetica', 'bold');
      doc.text('Tortová kalkulačka', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(12);
      doc.setTextColor(120, 70, 90);
      doc.text('Zhrnutie objednávky', pageWidth / 2, 28, { align: 'center' });

      let y = 55;

      const priceBy: Record<string, Map<string, number>> = {};
      dynamicSections.forEach(ds => { priceBy[ds.key] = new Map(ds.options.map(o => [o.name, o.price])); });
      const getP = (section: string, name?: string | null) => (name ? (priceBy[section]?.get(name) ?? 0) : 0);

      cart.forEach((item, idx) => {
        if (y > 250) { doc.addPage(); y = 25; }
        doc.setFillColor(240, 247, 255);
        doc.rect(15, y - 8, pageWidth - 30, 14, 'F');
        doc.setTextColor(0, 86, 179);
        doc.setFontSize(13);
        doc.text('Tvoja dokonalá torta', 20, y);
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        doc.text(item.eventName, pageWidth - 20, y, { align: 'right' });
        y += 10;

        const details = Object.entries(item.dynamicSelections || {}).map(([secKey, name]) => {
          const ds = dynamicSections.find(d => d.key === secKey);
          const label = (ds?.label || secKey.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')) + ':';
          const basePrice = getP(secKey, name);
          const opt = ds?.options.find(o => o.name === name);
          const isLinked = Boolean(opt?.linkedRecipeId || recipesByName[opt?.name || '']);
          let price = basePrice;
          if (isLinked) {
            const appliedMult = findApplicableDiameterMultiplier(secKey, item) || 1;
            price = basePrice * appliedMult;
          }
          return { label, value: name, price };
        });
        if (item.reward > 0) details.push({ label: 'Odmena pre tvorcu:', value: '', price: item.reward });

        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        details.forEach(d => {
          if (y > 270) { doc.addPage(); y = 25; }
          doc.setFont(activeFont !== 'helvetica' ? activeFont : 'helvetica', 'normal');
          doc.setTextColor(30, 30, 30);
          doc.text(d.label, 25, y);
          if (d.value) doc.text(d.value, 65, y);
          doc.setFont(activeFont !== 'helvetica' ? activeFont : 'helvetica', 'bold');
          doc.setTextColor(15, 90, 80);
          doc.text(`${d.price.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' });
          y += 6;
        });

        y += 4;
        if (idx < cart.length - 1) { doc.setDrawColor(220, 220, 220); doc.line(20, y, pageWidth - 20, y); y += 8; }
      });

      const grandTotal = cart.reduce((sum, it) => sum + (it.totalPrice * it.quantity), 0).toFixed(2);
      if (y > 245) { doc.addPage(); y = 25; }
      doc.setFillColor(255, 143, 177);
      doc.rect(15, y, pageWidth - 30, 18, 'F');
      doc.setFont(activeFont !== 'helvetica' ? activeFont : 'helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(91, 17, 51);
      doc.text('Spolu všetky položky:', 20, y + 12);
      doc.setFontSize(14);
      doc.text(`${grandTotal} €`, pageWidth - 20, y + 12, { align: 'right' });

      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Strana ${i} z ${pageCount}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
      }

      const dataUri = doc.output('datauristring');
      const base64 = dataUri.split(',')[1];
      return base64;
    } catch (e) {
      console.error('PDF generation for email failed', e);
      return null;
    }
  }

  

  // duplicates removed

  // totalPrice currently unused in UI (we show individual prices)

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {(isSubmittingOrder || orderSuccess) && (
        <div style={styles.fullscreenOverlay}>
          {isSubmittingOrder && !orderSuccess && (
            <div style={styles.loaderBox}>
              <div style={styles.loaderSpinner} />
              <div style={styles.loaderText}>Odosielame objednávku…</div>
            </div>
          )}
          {orderSuccess && (
            <div style={styles.successBox}>
              <div style={styles.successIcon}>✓</div>
              <div style={styles.successTitle}>Objednávka bola odoslaná</div>
              <div style={styles.successSubtitle}>Potvrdenie sme poslali na váš e‑mail.</div>
              <button style={styles.successButton} onClick={() => setOrderSuccess(false)}>Zavrieť</button>
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={{ width: 44, flexShrink: 0 }} />
          <h1 style={styles.title}>Tortová Kalkulačka</h1>
          <button
            onClick={() => setIsCartOpen(!isCartOpen)}
            onMouseDown={(e) => e.preventDefault()}
            style={styles.cartButton}
            title="Košík"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            {cart.length > 0 && <span style={styles.cartBadge}>{cart.length}</span>}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, backgroundColor: '#f5f5f5', padding: '0.5rem 0 180px' }}>
      <div style={styles.content} className="content">
          {loading && (
            <div style={{ minWidth: 200, marginBottom: '0.5rem' }}>Načítavam dáta…</div>
          )}
          {/* Dynamické sekcie (všetky sekcie z DB) */}
          {dynamicSections.map((dynSec) => (
            <section key={dynSec.key} style={styles.section}>
              {/* Title row */}
              {dynSec.layout === 'grid' ? (
                /* Grid: CSS grid 1fr|auto|1fr so pills are always perfectly centered */
                <div style={{ ...styles.sectionTitleRow, display: 'grid', gridTemplateColumns: '1fr auto 1fr', justifyContent: undefined }}>
                  <h2 style={{ ...styles.sectionTitle, whiteSpace: 'nowrap', justifySelf: 'start', alignSelf: 'center' }}>
                    {dynSec.label}{dynSec.required ? ' *' : ''}
                  </h2>
                  {/* Center column — pills when collapsed, empty when open */}
                  {!dynSec.isOpen ? (
                    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                      {dynSec.options.map((opt) => {
                        const isSelected = dynSec.selectedId === opt.id;
                        let price = opt.price;
                        if (multiplyEnabled[dynSec.key] !== false) {
                          const applied = findApplicableDiameterMultiplier(dynSec.key);
                          price = price * (applied || 1);
                        }
                        return (
                          <span
                            key={opt.id}
                            onClick={() => onSelectDynamic(dynSec.key, opt.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                              padding: '0.4rem 1rem',
                              background: '#fff',
                              color: isSelected ? 'var(--color-primary)' : '#555',
                              border: `2px solid ${isSelected ? 'var(--color-primary-light)' : (dynSec.required && !dynSec.selectedId && showRequiredHint ? '#ff6b6b' : '#e0e6f0')}`,
                              borderRadius: '24px',
                              fontSize: '0.85rem',
                              fontWeight: isSelected ? 700 : 500,
                              boxShadow: isSelected ? '0 0 0 3px color-mix(in srgb, var(--color-primary-light) 20%, transparent), 0 2px 8px color-mix(in srgb, var(--color-primary-light) 15%, transparent)' : '0 1px 4px #0001',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              transition: 'color 0.15s, border-color 0.15s, box-shadow 0.15s',
                            }}>
                            {opt.name}
                            {!dynSec.hidePrice && (
                              <span style={{ fontSize: '0.77rem', opacity: isSelected ? 0.75 : 0.5, fontWeight: 600 }}>
                                {price.toFixed(2)} €
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div /> /* empty center cell when open */
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', justifySelf: 'end', alignSelf: 'center' }}>
                    <button
                      className="toggle-btn"
                      aria-expanded={dynSec.isOpen}
                      onClick={() => {
                        setDynamicSections(prev => prev.map(ds =>
                          ds.key === dynSec.key ? { ...ds, isOpen: !ds.isOpen } : ds
                        ));
                      }}
                      style={{ ...styles.toggleButton, transform: dynSec.isOpen ? 'rotate(0deg)' : 'rotate(180deg)', flex: '0 0 auto' }}
                      title={dynSec.isOpen ? 'Skryť sekciu' : 'Zobraziť sekciu'}
                    >
                      ▾
                    </button>
                  </div>
                </div>
              ) : (
                /* List: 3-column layout — h2 left | pill centered | price+button right */
                <div style={{ ...styles.sectionTitleRow, justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ ...styles.sectionTitle, flex: '0 0 auto', whiteSpace: 'nowrap', minWidth: titleColWidth }}>
                    {dynSec.label}{dynSec.required ? ' *' : ''}
                  </h2>
                  {/* Center: selected pill when collapsed — stretches to fill space */}
                  <div style={{ flex: '1', display: 'flex', alignItems: 'center', padding: '0 0.75rem', minWidth: 0 }}>
                    {!dynSec.isOpen && dynSec.selectedId && (() => {
                      const selOpt = dynSec.options.find(o => o.id === dynSec.selectedId);
                      if (!selOpt) return null;
                      return (
                        <span
                          onClick={() => setDynamicSections(prev => prev.map(ds => ds.key === dynSec.key ? { ...ds, isOpen: true } : ds))}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                            width: '100%',
                            padding: '0.4rem 1rem',
                            background: '#fff',
                            color: 'var(--color-primary)',
                            border: '2px solid var(--color-primary-light)',
                            borderRadius: '24px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-primary-light) 20%, transparent), 0 2px 8px color-mix(in srgb, var(--color-primary-light) 15%, transparent)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}>
                          {selOpt.name}
                        </span>
                      );
                    })()}
                  </div>
                  {/* Right: price badge + toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '0 0 auto', minWidth: '70px', justifyContent: 'flex-end' }}>
                    {!dynSec.isOpen && dynSec.selectedId && !dynSec.hidePrice && (() => {
                      const selOpt = dynSec.options.find(o => o.id === dynSec.selectedId);
                      if (!selOpt) return null;
                      let price = selOpt.price;
                      if (multiplyEnabled[dynSec.key] !== false) {
                        const applied = findApplicableDiameterMultiplier(dynSec.key);
                        price = price * (applied || 1);
                      }
                      return (
                        <span style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'var(--color-primary)',
                          whiteSpace: 'nowrap',
                          background: 'var(--color-primary-bg)',
                          border: '1.5px solid var(--color-primary-border)',
                          borderRadius: '20px',
                          padding: '0.25rem 0',
                          minWidth: '72px',
                          textAlign: 'center' as const,
                        }}>
                          {price.toFixed(2)} €
                        </span>
                      );
                    })()}
                    <button
                      className="toggle-btn"
                      aria-expanded={dynSec.isOpen}
                      onClick={() => {
                        setDynamicSections(prev => prev.map(ds =>
                          ds.key === dynSec.key ? { ...ds, isOpen: !ds.isOpen } : ds
                        ));
                      }}
                      style={{ ...styles.toggleButton, transform: dynSec.isOpen ? 'rotate(0deg)' : 'rotate(180deg)', flex: '0 0 auto' }}
                      title={dynSec.isOpen ? 'Skryť sekciu' : 'Zobraziť sekciu'}
                    >
                      ▾
                    </button>
                  </div>
                </div>
              )}
              {/* Description row — animated, shown when collapsed (list layout only) */}
              {dynSec.layout !== 'grid' && (() => {
                const selOpt = dynSec.options.find(o => o.id === dynSec.selectedId);
                const desc = selOpt?.description?.trim();
                if (!desc) return null;
                return (
                  <div className={`section-desc ${!dynSec.isOpen ? 'section-desc--visible' : 'section-desc--hidden'}`}>
                    <div>
                      <div style={{ fontSize: '0.82rem', color: '#333', fontStyle: 'italic', lineHeight: 1.5, marginTop: '0.25rem', textAlign: 'left' }}>
                        {desc}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* Description row — animated, shown when grid is collapsed */}
              {dynSec.layout === 'grid' && (() => {
                const selOpt = dynSec.options.find(o => o.id === dynSec.selectedId);
                const optDesc = selOpt?.description?.trim();
                const secDesc = !dynSec.selectedId && dynSec.description && !dynSec.description.toLowerCase().includes('spodny popis')
                  ? dynSec.description.trim()
                  : '';
                if (!optDesc && !secDesc) return null;
                return (
                  <div className={`section-desc ${!dynSec.isOpen ? 'section-desc--visible' : 'section-desc--hidden'}`}>
                    <div>
                      {secDesc && (
                        <div style={{ fontSize: '0.82rem', color: '#888', lineHeight: 1.5, marginTop: '0.25rem' }}>
                          {secDesc}
                        </div>
                      )}
                      {optDesc && (
                        <div style={{ fontSize: '0.82rem', color: '#333', fontStyle: 'italic', lineHeight: 1.5, marginTop: '0.25rem' }}>
                          {optDesc}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className={`section-body ${dynSec.isOpen ? 'section-body--open' : 'section-body--closed'}`}>
                <div style={{ overflow: openDropdownKey === dynSec.key ? 'visible' : 'hidden' }}>
                  {dynSec.description && !dynSec.description.toLowerCase().includes('spodny popis') && (
                    <div style={styles.sectionDescription}>{dynSec.description}</div>
                  )}
                  {dynSec.layout === 'grid' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '4px 0', alignItems: 'flex-start' }}>
                      {dynSec.options.map((opt) => {
                        const isSelected = dynSec.selectedId === opt.id;
                        let price = opt.price;
                        if (multiplyEnabled[dynSec.key] !== false) {
                          const applied = findApplicableDiameterMultiplier(dynSec.key);
                          price = price * (applied || 1);
                        }
                        return (
                          <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <button
                              onClick={() => onSelectDynamic(dynSec.key, opt.id)}
                              style={{
                                padding: '0.4rem 1rem',
                                background: '#fff',
                                color: isSelected ? 'var(--color-primary)' : '#333',
                                border: `2px solid ${isSelected ? 'var(--color-primary-light)' : (dynSec.required && !dynSec.selectedId && showRequiredHint ? '#ff6b6b' : '#e0e6f0')}`,
                                borderRadius: '24px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: isSelected ? 700 : 500,
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                boxShadow: isSelected ? '0 0 0 3px color-mix(in srgb, var(--color-primary-light) 20%, transparent), 0 2px 10px color-mix(in srgb, var(--color-primary-light) 19%, transparent)' : '0 1px 4px #0001',
                                transition: 'color 0.15s, border-color 0.15s, box-shadow 0.15s',
                                outline: 'none',
                                flex: '0 0 auto',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span>{opt.name}</span>
                              {!dynSec.hidePrice && (
                                <span style={{ fontSize: '0.77rem', opacity: isSelected ? 0.75 : 0.55, fontWeight: 600 }}>
                                  {price.toFixed(2)} €
                                </span>
                              )}
                            </button>
                            {opt.description?.trim() && (
                              <span style={{ fontSize: '0.82rem', color: '#555', fontStyle: 'italic', lineHeight: 1.4 }}>
                                {opt.description}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {dynSec.layout !== 'grid' && (
                  <div style={styles.sectionHeaderRow}>
                    <div style={styles.centerGroup}>
                      {/* Custom dropdown */}
                      <div
                        data-dropdown-key={dynSec.key}
                        style={{ flex: 1, minWidth: 0, position: 'relative' as const }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            if (openDropdownKey === dynSec.key) {
                              setOpenDropdownKey(null);
                              setDropdownRect(null);
                            } else {
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                              setDropdownRect({ top: rect.bottom + 6, left: rect.left, width: rect.width });
                              setOpenDropdownKey(dynSec.key);
                            }
                          }}
                          style={{
                            ...styles.select,
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            border: (dynSec.required && !dynSec.selectedId && showRequiredHint)
                              ? '2px solid #ff6b6b'
                              : dynSec.selectedId ? '2px solid var(--color-primary-light)' : '2px solid #e0e6f0',
                            backgroundColor: (dynSec.required && !dynSec.selectedId && showRequiredHint) ? '#fff5f5' : '#ffffff',
                            color: dynSec.selectedId ? 'var(--color-primary)' : '#888',
                            fontWeight: dynSec.selectedId ? 600 : 400,
                            boxShadow: dynSec.selectedId ? '0 0 0 3px color-mix(in srgb, var(--color-primary-light) 20%, transparent), 0 2px 8px color-mix(in srgb, var(--color-primary-light) 15%, transparent)' : '0 1px 4px rgba(0,0,0,0.06)',
                            backgroundImage: 'none',
                            cursor: 'pointer',
                            textAlign: 'left' as const,
                            padding: '0.45rem 1rem',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {dynSec.selectedId
                              ? dynSec.options.find(o => o.id === dynSec.selectedId)?.name ?? 'Vyberte možnosť'
                              : 'Vyberte možnosť'}
                          </span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                            stroke={dynSec.selectedId ? 'var(--color-primary)' : '#aaa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ flexShrink: 0, marginLeft: 'auto', transform: openDropdownKey === dynSec.key ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                      </div>
                      {!dynSec.hidePrice ? (
                        <div style={styles.priceBox}>
                          {(() => {
                            const selectedOpt = dynSec.options.find(o => o.id === dynSec.selectedId);
                            let price = selectedOpt?.price ?? 0;
                            if (selectedOpt && multiplyEnabled[dynSec.key] !== false) {
                              const applied = findApplicableDiameterMultiplier(dynSec.key);
                              price = price * (applied || 1);
                            }
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>{price.toFixed(2)} €</span>
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  )}
                  {/* Description speech bubble — list layout */}
                  {dynSec.layout !== 'grid' && (() => {
                    const selOpt = dynSec.options.find(o => o.id === dynSec.selectedId);
                    const desc = selOpt?.description?.trim();
                    if (!desc) return null;
                    return (
                      <div style={{ position: 'relative', marginTop: '6px' }}>
                        {/* border triangle */}
                        <div style={{
                          position: 'absolute',
                          top: -9,
                          left: 22,
                          width: 0, height: 0,
                          borderLeft: '9px solid transparent',
                          borderRight: '9px solid transparent',
                          borderBottom: '9px solid var(--color-primary-border)',
                        }} />
                        {/* fill triangle */}
                        <div style={{
                          position: 'absolute',
                          top: -7,
                          left: 24,
                          width: 0, height: 0,
                          borderLeft: '7px solid transparent',
                          borderRight: '7px solid transparent',
                          borderBottom: '7px solid var(--color-primary-bg)',
                        }} />
                        <div style={{
                          padding: '0.55rem 1rem',
                          background: 'var(--color-primary-bg)',
                          border: '1.5px solid var(--color-primary-border)',
                          borderRadius: '12px',
                          fontSize: '0.83rem',
                          color: 'var(--color-primary)',
                          fontStyle: 'italic',
                          lineHeight: 1.5,
                        }}>
                          {desc}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>
          ))}

        </div>
      {openDropdownKey && dropdownRect && (() => {
        const sec = dynamicSections.find(s => s.key === openDropdownKey);
        if (!sec) return null;
        return createPortal(
          <div
            id="dropdown-portal"
            style={{ position: 'fixed', top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, zIndex: 9999, overflow: 'hidden', borderRadius: '1rem', border: '2px solid var(--color-primary-border)', backgroundColor: '#fff', padding: '0.375rem', boxShadow: '0 8px 32px color-mix(in srgb, var(--color-primary) 15%, transparent)' }}
          >
            {sec.options.map((opt, idx) => {
              const isSelected = sec.selectedId === opt.id;
              return (
                <div
                  key={opt.id}
                  onMouseDown={() => {
                    onSelectDynamic(sec.key, opt.id);
                    setOpenDropdownKey(null);
                    setDropdownRect(null);
                  }}
                  className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-4 py-1.5 text-sm transition-colors duration-100"
                  style={{
                    borderBottom: idx < sec.options.length - 1 ? '1px solid var(--color-primary-bg)' : 'none',
                    backgroundColor: isSelected ? 'var(--color-primary-bg)' : 'transparent',
                    color: isSelected ? 'var(--color-primary)' : '#374151',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-primary-bg)'; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                >
                  {isSelected ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <span style={{ width: 13, flexShrink: 0 }} />
                  )}
                  <span>{opt.name}</span>
                </div>
              );
            })}
          </div>,
          document.body
        );
      })()}
      </main>
      </div>

      {/* Cart Sidebar */}
      {isCartOpen && (
        <>
          <div style={styles.cartSidebar}>
            {/* Header */}
            <div style={styles.cartHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={styles.cartTitle}>Košík</h2>
                <span style={styles.cartCountBadge}>{cart.length}</span>
              </div>
              <button onClick={() => setIsCartOpen(false)} style={styles.cartCloseBtn} title="Zavrieť">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Content */}
            <div style={styles.cartContent}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#ccc' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🛒</div>
                  <p style={{ margin: 0, fontWeight: 500 }}>Košík je prázdny</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {cart.map((item, cartIdx) => (
                    <div
                      key={item.id}
                      onClick={() => { pruneEmptyCartItems(item.id); setActiveItemId(item.id); }}
                      style={{
                        borderRadius: '14px',
                        cursor: 'pointer',
                        border: activeItemId === item.id ? '2px solid var(--color-primary)' : '2px solid #ede8ed',
                        background: activeItemId === item.id ? 'var(--color-primary-bg)' : '#fafafa',
                        overflow: 'hidden',
                        transition: 'border-color 0.2s, background 0.2s',
                        boxShadow: activeItemId === item.id ? '0 2px 12px color-mix(in srgb, var(--color-primary) 10%, transparent)' : '0 1px 3px rgba(0,0,0,0.04)',
                      }}
                    >
                      {/* Cake title bar */}
                      <div style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid', borderBottomColor: activeItemId === item.id ? 'var(--color-primary-border)' : '#ede8ed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: activeItemId === item.id ? 'var(--color-primary-bg)' : '#f5f0f5' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: activeItemId === item.id ? 'var(--color-primary)' : '#b09ab0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Torta #{cartIdx + 1}
                        </span>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: activeItemId === item.id ? 'var(--color-primary)' : '#7a5f7a' }}>
                          {(item.totalPrice * item.quantity).toFixed(2)} €
                        </span>
                      </div>

                      {/* Breakdown rows */}
                      <div style={{ padding: '0.3rem 0.55rem 0.5rem' }}>
                        {item.dynamicSelections && Object.entries(item.dynamicSelections)
                          .sort(([aKey], [bKey]) => {
                            const aIdx = dynamicSections.findIndex(d => d.key === aKey);
                            const bIdx = dynamicSections.findIndex(d => d.key === bKey);
                            return (aIdx === -1 ? 99999 : aIdx) - (bIdx === -1 ? 99999 : bIdx);
                          })
                          .map(([secKey, name]) => {
                            const dsec = dynamicSections.find(d => d.key === secKey);
                            const label = dsec?.label || secKey.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                            const opt = dsec?.options.find(o => o.name === name);
                            const basePrice = dsec?.hidePrice ? 0 : (opt?.price ?? 0);
                            const appliedMult = multiplyEnabled[secKey] !== false ? findApplicableDiameterMultiplier(secKey, item) : 1;
                            const price = basePrice * appliedMult;
                            return (
                              <div key={`${item.id}-${secKey}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.4rem', borderRadius: '8px', marginTop: '0.1rem' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-bg)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{label}</div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#2a1a2a', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                                  {!dsec?.hidePrice && price > 0 && (
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary-bg)', border: '1px solid var(--color-primary-border)', borderRadius: '20px', padding: '0.15rem 0.45rem', whiteSpace: 'nowrap', minWidth: '68px', textAlign: 'center', display: 'inline-block' }}>
                                      {price.toFixed(2)} €
                                    </span>
                                  )}
                                  <button
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d0b0c0', lineHeight: 1, transition: 'color 0.15s, background 0.15s' }}
                                    onMouseEnter={e => { const b = e.currentTarget; b.style.color = '#fff'; b.style.background = 'var(--color-primary)'; }}
                                    onMouseLeave={e => { const b = e.currentTarget; b.style.color = '#d0b0c0'; b.style.background = 'none'; }}
                                    onClick={(e) => { e.stopPropagation(); removeDynamicPart(item.id, secKey); }}
                                    title="Odstrániť"
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}

                  {/* Add cake */}
                  {(() => {
                    const requiredSections = dynamicSections.filter(s => s.required);
                    const allHaveRequired = cart.every(it => requiredSections.every(ds => Boolean(it.dynamicSelections?.[ds.key])));
                    return (
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const hasEmpty = cart.some(it => !(it.dynamicSelections && Object.values(it.dynamicSelections).some(Boolean)));
                          if (hasEmpty || !allHaveRequired) { setShowRequiredHint(true); return; }
                          const newItem: CartItem = { id: Date.now().toString(), dynamicSelections: {}, reward: 0, totalPrice: 0, quantity: 1, eventName: `Torta #${cart.length + 1}` };
                          setCart(prev => [...prev, newItem]);
                          setActiveItemId(newItem.id);
                          setDynamicSections(prev => prev.map(ds => ({ ...ds, selectedId: null })));
                          setShowRequiredHint(false);
                        }}
                        style={styles.addCakeBtn}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: '0.35rem', flexShrink: 0 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        ďalšia torta
                      </button>
                    );
                  })()}

                  {/* PDF export */}
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const requiredSections = dynamicSections.filter(s => s.required);
                      const allHaveRequired = cart.every(it => requiredSections.every(ds => Boolean(it.dynamicSelections?.[ds.key])));
                      if (!allHaveRequired) { setShowRequiredHint(true); return; }
                      exportCartToPDF();
                    }}
                    style={styles.pdfExportBtn}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.4rem', flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    Exportovať do PDF
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div style={styles.cartFooterElevated}>
                {(() => {
                  const requiredSections = dynamicSections.filter(s => s.required);
                  const allHaveRequired = cart.every(it => requiredSections.every(ds => Boolean(it.dynamicSelections?.[ds.key])));
                  return (
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { if (allHaveRequired) { setIsEmailModalOpen(true); } else { setShowRequiredHint(true); } }}
                      style={styles.totalButton}
                    >
                      Záväzne objednať • {cart.reduce((sum, item) => sum + (item.totalPrice * item.quantity), 0).toFixed(2)} €
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
        </>
      )}

      

      <EmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSubmit={(name, email) => handleCheckoutWithData(name, email)}
      />
    </>
  );
}

const styles = {
  fullscreenOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(255,255,255,0.9)',
    zIndex: 3000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(2px)',
  } as React.CSSProperties,
  loaderBox: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '1.5rem 2rem',
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  } as React.CSSProperties,
  loaderSpinner: {
    width: 42,
    height: 42,
    border: '4px solid #e5e7eb',
    borderTopColor: '#5b8fd9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  } as React.CSSProperties,
  loaderText: {
    color: '#1f2937',
    fontWeight: 600,
    fontSize: '1rem',
  } as React.CSSProperties,
  successBox: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    padding: '1.75rem 2.25rem',
    boxShadow: '0 12px 32px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    textAlign: 'center' as const,
    maxWidth: 360,
  } as React.CSSProperties,
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#dcfce7',
    color: '#15803d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 700,
  } as React.CSSProperties,
  successTitle: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#111827',
  } as React.CSSProperties,
  successSubtitle: {
    fontSize: '0.95rem',
    color: '#374151',
    lineHeight: 1.5,
  } as React.CSSProperties,
  successButton: {
    marginTop: '0.75rem',
    background: '#5b8fd9',
    border: '1px solid #4e7ec2',
    color: '#fff',
    borderRadius: 10,
    padding: '0.65rem 1.2rem',
    cursor: 'pointer',
    fontWeight: 700,
    boxShadow: '0 6px 16px rgba(91,143,217,0.28)',
  } as React.CSSProperties,
  container: {
    minHeight: '100vh',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column' as const,
    margin: 0,
    padding: 0,
  } as React.CSSProperties,
  header: {
    width: '100%',
    boxSizing: 'border-box' as const,
    backgroundColor: '#ffffff',
    padding: '0.85rem 0',
    borderBottom: '1px solid var(--color-primary-border)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  } as React.CSSProperties,
  title: {
    margin: 0,
    color: 'var(--color-primary)',
    fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
    fontFamily: "'Dancing Script', cursive",
    fontWeight: 700,
    letterSpacing: '0.01em',
    lineHeight: 1.2,
  } as React.CSSProperties,
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-start',
    padding: '2rem 1rem',
    backgroundColor: '#f5f5f5',
    minWidth: '320px',
  } as React.CSSProperties,
  content: {
    width: '100%',
    maxWidth: '720px',
    margin: '0 auto',
    paddingTop: '0.5rem',
    padding: '0.5rem 1rem',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  selectionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
  } as React.CSSProperties,
  select: {
    flex: 1,
    minWidth: 0,
    padding: '0.45rem 2.5rem 0.45rem 1rem',
    borderRadius: '24px',
    border: '2px solid #e0e6f0',
    background: '#ffffff',
    fontSize: '0.9rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#333',
    fontWeight: 500,
    appearance: 'none',
    outline: 'none',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    position: 'relative',
    zIndex: 2,
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e0457b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.9rem center',
    backgroundSize: '18px',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  } as React.CSSProperties,
  headerInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: '720px',
    padding: '0 1rem',
  } as React.CSSProperties,
  section: {
    marginBottom: '0.5rem',
    backgroundColor: '#ffffff',
    border: '1px solid #e6e6e9',
    borderRadius: '10px',
    padding: '0.75rem 1rem',
    boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    minWidth: 0,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    margin: '0 0 0.5rem',
    overflow: 'visible',
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: '0.75rem',
    color: '#ff9e9eff',
    flex: '0 0 auto',
    gap: '1rem',
  } as React.CSSProperties,
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    width: '100%',
    overflow: 'visible',
  } as React.CSSProperties,
  centerGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flex: '1',
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between',
  } as React.CSSProperties,
  priceBox: {
    background: 'var(--color-primary-bg)',
    color: 'var(--color-primary)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.35rem 0.9rem',
    borderRadius: '20px',
    border: '1.5px solid var(--color-primary-border)',
    minWidth: 72,
    textAlign: 'center' as const,
    fontSize: '0.9rem',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  } as React.CSSProperties,
  priceBoxSmall: {
    color: '#5b6b7a',
    fontSize: '0.85rem',
    minWidth: 78,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.18rem 0.5rem',
    textAlign: 'center' as const,
    height: '2rem',
    lineHeight: '2rem',
  } as React.CSSProperties,
  detailBox: {
    marginTop: '0.75rem',
    paddingTop: '0.5rem',
    borderTop: '1px dashed #eee',
    display: 'flex',
    gap: '1.25rem',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  detailRow: {
    color: '#333',
    fontSize: '0.95rem',
  } as React.CSSProperties,
  sectionTitle: {
    margin: 0,
    textAlign: 'left' as const,
    fontSize: '1.1rem',
    flex: '1',
    color: 'var(--color-primary)',
  } as React.CSSProperties,
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
    minHeight: '42px',
  } as React.CSSProperties,
  sectionDescription: {
    fontSize: '0.85rem',
    fontStyle: 'italic',
    color: '#666',
    marginBottom: '0.75rem',
    lineHeight: '1.4',
  } as React.CSSProperties,
  toggleButton: {
    background: 'transparent',
    border: '2px solid #e0e6f0',
    borderRadius: '50%',
    width: '34px',
    height: '34px',
    minWidth: '34px',
    flex: '0 0 34px',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: 'var(--color-primary)',
    display: 'flex' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    transformOrigin: '50% 50%',
    transition: 'transform 0.18s ease, border-color 0.15s, box-shadow 0.15s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  } as React.CSSProperties,
  buttonRow: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  sizeButton: {
    padding: '0.6rem 1rem',
    borderRadius: '6px',
    border: '1px solid #e0e0e6',
    backgroundColor: '#ffcdcdff',
    cursor: 'pointer',
    minWidth: '80px',
  } as React.CSSProperties,
  sizeButtonSelected: {
    backgroundColor: '#007bff',
    color: 'white',
    borderColor: '#0066d6',
    transform: 'translateY(-1px)',
  } as React.CSSProperties,
  heading: {
    textAlign: 'left' as const,
    marginBottom: '1.5rem',
    color: '#333',
    margin: '0 0 1.5rem 0',
  } as React.CSSProperties,
  radioContainer: {
    display: 'flex',
    gap: '2rem',
    marginBottom: '2rem',
    alignItems: 'center',
  } as React.CSSProperties,
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    fontSize: '1rem',
  } as React.CSSProperties,
  radioInput: {
    cursor: 'pointer',
    width: '18px',
    height: '18px',
  } as React.CSSProperties,
  confirmButton: {
    padding: '0.75rem 2rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1rem',
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  confirmButtonContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '1rem',
    paddingTop: '0.5rem',
  } as React.CSSProperties,
  sliderContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
    flex: 1,
  } as React.CSSProperties,
  smallLabel: {
    fontSize: '0.85rem',
    color: '#5b6b7a',
  } as React.CSSProperties,
  slider: {
    width: '100%',
  } as React.CSSProperties,
  
  priceBreakdown: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  } as React.CSSProperties,
  priceItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    fontSize: '0.95rem',
    color: '#333',
  } as React.CSSProperties,
  breakdownList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    padding: '0.5rem 0',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  breakdownRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.3rem 0.4rem',
    borderRadius: '8px',
  } as React.CSSProperties,
  breakdownName: {
    color: '#2a1a2a',
    fontSize: '0.9rem',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontWeight: 600,
  } as React.CSSProperties,
  breakdownPrice: {
    fontWeight: 700,
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  breakdownRemove: {
    background: 'none',
    border: 'none',
    color: '#d0b0c0',
    borderRadius: '50%',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  cartButton: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
    border: 'none',
    outline: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary) 35%, transparent)',
    color: 'white',
    flexShrink: 0,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  } as React.CSSProperties,
  cartBadge: {
    position: 'absolute' as const,
    top: '-5px',
    right: '-5px',
    background: '#ffffff',
    color: 'var(--color-primary)',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.65rem',
    fontWeight: 800,
    border: '2px solid var(--color-primary)',
    pointerEvents: 'none',
  } as React.CSSProperties,
  
  cartOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999,
  } as React.CSSProperties,
  cartSidebar: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    width: '360px',
    maxWidth: '92vw',
    height: '100vh',
    backgroundColor: '#fff',
    zIndex: 1000,
    boxShadow: '-8px 0 32px rgba(0,0,0,0.10)',
    display: 'flex',
    flexDirection: 'column' as const,
    borderLeft: '1px solid var(--color-primary-border)',
  } as React.CSSProperties,
  cartHeader: {
    padding: '1.1rem 1.2rem',
    borderBottom: '1px solid var(--color-primary-bg)',

    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#fff',
  } as React.CSSProperties,
  cartTitle: {
    margin: 0,
    color: 'var(--color-primary)',
    fontSize: '1.45rem',
    fontFamily: "'Dancing Script', cursive",
    fontWeight: 700,
    lineHeight: 1,
  } as React.CSSProperties,
  cartCountBadge: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
    color: '#fff',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: 800,
    padding: '0.15rem 0.5rem',
    lineHeight: 1.4,
  } as React.CSSProperties,
  cartCloseBtn: {
    background: 'var(--color-primary-bg)',
    border: 'none',
    cursor: 'pointer',
    color: '#999',
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    transition: 'background 0.15s, color 0.15s',
  } as React.CSSProperties,
  cartContent: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '1rem',
  } as React.CSSProperties,
  cartEmpty: {
    textAlign: 'center' as const,
    color: '#999',
    padding: '2rem',
  } as React.CSSProperties,
  cartItemSummary: {
    flex: 1,
    fontSize: '0.9rem',
    color: '#555',
    fontWeight: 500,
  } as React.CSSProperties,
  addCakeBtn: {
    background: 'transparent',
    color: 'var(--color-primary)',
    border: '1.5px dashed var(--color-primary-border)',
    outline: 'none',
    padding: '0.55rem 1rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
    textAlign: 'center' as const,
    fontWeight: 600,
    borderRadius: '10px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, border-color 0.15s',
  } as React.CSSProperties,
  pdfExportBtn: {
    width: '100%',
    padding: '0.65rem 1rem',
    background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
    color: '#fff',
    border: 'none',
    outline: 'none',
    borderRadius: '10px',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 10px rgba(124,58,237,0.25)',
    transition: 'opacity 0.15s',
  } as React.CSSProperties,
  priceBare: {
    marginLeft: 'auto',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
  } as React.CSSProperties,
  cartFooterElevated: {
    padding: '0.9rem 1rem',
    borderTop: '1px solid var(--color-primary-bg)',
    background: '#fff',
  } as React.CSSProperties,
  totalButton: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
    color: '#fff',
    border: 'none',
    outline: 'none',
    borderRadius: '12px',
    padding: '0.9rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 700,
    boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary) 30%, transparent)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    letterSpacing: '0.01em',
  } as React.CSSProperties,
  qtyBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid #e6e6e9',
    backgroundColor: '#f8fafc',
    cursor: 'pointer',
    fontSize: '1rem',
    lineHeight: 1,
  } as React.CSSProperties,
  qtyCount: {
    minWidth: '32px',
    textAlign: 'center' as const,
    fontWeight: 700,
    color: '#334155',
  } as React.CSSProperties,
};
