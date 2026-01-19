import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import EmailModal from '../components/EmailModal';
import { supabase } from '../lib/supabase';

export function HomePage() {
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
  }
  const [dynamicSections, setDynamicSections] = useState<DynamicSectionData[]>([]);
  const [diameterMultipliersMap, setDiameterMultipliersMap] = useState<Record<string, number>>({});
  const [multByOptionId, setMultByOptionId] = useState<Record<string, number>>({});
  
  const [recipesByName, setRecipesByName] = useState<Record<string,string>>({});
  

  // Helper: find an applicable diameter multiplier for a given option (and optional cart item).
  function findApplicableDiameterMultiplier(targetSectionKey: string, item?: CartItem) {
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
      // clear selections when no active item
      setDynamicSections(prev => prev.map(ds => ({ ...ds, selectedId: null })));
      return;
    }
    // Use cartRef to avoid adding `cart` to deps and creating a feedback loop
    const item = cartRef.current.find(it => it.id === activeItemId);
    if (!item) return;
    // Map stored selection names back to option ids for each dynamic section
    setDynamicSections(prev => prev.map(ds => {
      const selName = item.dynamicSelections?.[ds.key];
      if (!selName) return { ...ds, selectedId: null };
      const found = ds.options.find(o => o.name === selName);
      return { ...ds, selectedId: found ? found.id : null };
    }));

  }, [activeItemId]);

  // Vypočet celkovej ceny
  // totalPrice (global) no longer used; item totals computed per cart item

  useEffect(() => {
    async function init() {
        const sections = await loadAllSections();
        await loadDiameterMultipliers(sections);
        await loadRecipes();
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

  async function loadDiameterMultipliers(sectionsParam?: DynamicSectionData[]) {
    try {
      const { data, error } = await supabase
        .from('diameter_multipliers')
        .select('section_key, option_id, multiplier');
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

  async function loadRecipes() {
    try {
      const { data, error } = await supabase.from('recipes').select('id, name');
      if (error) throw error;
      const map: Record<string,string> = {};
      (data || []).forEach((r: any) => { if (r?.name) map[String(r.name)] = r.id; });
      setRecipesByName(map);
      
    } catch (e) {
      console.error('loadRecipes failed', e);
    }
  }

  async function loadAllSections() {
    try {
      const { data, error } = await supabase
        .from('section_options')
        .select('*')
        .order('section', { ascending: true })
        .order('sort_order', { ascending: true });

      if (error) throw error;

      const opts = data || [];

      // Fetch bottom descriptions from section_meta
      // Try to read sort_order when available
      let meta: any[] | null = null;
      try {
        const tmp = await supabase
          .from('section_meta')
          .select('section, description, required, sort_order');
        meta = tmp.data as any[] | null;
      } catch (e) {
        const fallback = await supabase
          .from('section_meta')
          .select('section, description, required');
        if (fallback.error) throw fallback.error;
        meta = (fallback.data as any[] | null) || [];
      }
      const metaRows: Array<{ section: string; description: string; required?: boolean }> = (meta || []) as any;
      const descMap: Record<string, string> = {};
      const reqMap: Record<string, boolean> = {};
      metaRows.forEach(m => {
        if (m?.section) {
          descMap[m.section] = m.description || '';
          reqMap[m.section] = Boolean((m as any).required);
        }
      });

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
        const metaDesc = descMap[key];
        const label = (!isPlaceholder(metaDesc)) ? metaDesc : defaultLabel;
        return {
          key,
          label,
          options: sectionOpts,
          description: metaDesc || '',
          isOpen: true,
          selectedId: null,
          required: Boolean(reqMap[key]),
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
    const newDynamicSections = dynamicSections.map(ds => ds.key === key ? { ...ds, selectedId: optionId } : ds);
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
      const price = opt?.price ?? 0;

      // Determine multiplier to apply for recipe-linked options.
      // Prefer per-item selection of a managed diameter section, else fall back
      // to the globally selected diameter multiplier for that section.
      let appliedMult = 1;
      const isLinked = Boolean(opt?.linkedRecipeId || recipesByName[opt?.name || '']);
      if (isLinked) {
        // Look for any managed section that has a selection on this cart item
        const managed = Array.from(new Set(Object.keys(diameterMultipliersMap).map(k => k.split(':')[0])));
        for (const m of managed) {
          // If this cart item has a selection for the managed section, use it
          const itemSelName = it.dynamicSelections?.[m];
          let diaOptionId: string | undefined;
          if (itemSelName) {
            const sec = dynamicSections.find(d => d.key === m);
            diaOptionId = sec?.options.find(op => op.name === itemSelName)?.id;
          }
          // Otherwise, use global selected id from dynamicSections
          if (!diaOptionId) {
            diaOptionId = dynamicSections.find(d => d.key === m)?.selectedId || undefined;
          }
          if (diaOptionId) {
            let mult = diameterMultipliersMap[`${m}:${diaOptionId}`];
            if (!mult) {
              const entry = Object.entries(diameterMultipliersMap).find(([k]) => k.endsWith(`:${diaOptionId}`));
              if (entry) { mult = entry[1]; }
            }
            // final fallback by option id
            if (!mult) {
              const byOptMult = multByOptionId[diaOptionId];
              if (byOptMult) { mult = byOptMult; }
            }
            if (mult) { appliedMult = mult; break; }
          }
        }
      }

      // If option is recipe-linked but no multiplier was found, nothing to do

      total += price * appliedMult;
    }

    return total + (it.reward || 0);
  }

  // Recompute cart totals whenever multipliers or sections change
  useEffect(() => {
    // Recompute totals when multipliers or sections change
    if (!cart || cart.length === 0) return;
    setCart(prev => prev.map(it => ({ ...it, totalPrice: computeItemTotal(it) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diameterMultipliersMap, dynamicSections]);

  // addCake is no longer used directly; '+ ďalšia torta' starts a fresh item

  function computeItemTotalWithSections(it: CartItem, sections: DynamicSectionData[]) {
    let total = 0;
    for (const [secKey, name] of Object.entries(it.dynamicSelections || {})) {
      const ds = sections.find(d => d.key === secKey);
      if (!ds) continue;
      const opt = ds.options.find(o => o.name === name);
      if (!opt) continue;
      let price = opt.price || 0;
      const isLinked = Boolean(opt.linkedRecipeId || recipesByName[opt?.name || '']);
      if (isLinked) {
        // Determine applicable multiplier using provided sections (prefer item-level selection)
        let appliedMult = 1;
        const managed = Array.from(new Set(Object.keys(diameterMultipliersMap).map(k => k.split(':')[0])));
        for (const m of managed) {
          if (m === secKey) continue;
          // item-level selection takes precedence
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
            // final fallback by option id
            if (!mult) {
              const byOptMult = multByOptionId[diaOptionId];
              if (byOptMult) { mult = byOptMult; }
            }
            if (mult) { appliedMult = mult; break; }
          }
        }
        // Debugging: log when a linked option is processed and either a multiplier applied or missing
        if (appliedMult === 1) {
          try {
          
          } catch (e) { /* ignore */ }
        } else {
          
        }
        price = price * appliedMult;
      }
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
    const updatedSections = dynamicSections.map(ds => ds.key === sectionKey ? { ...ds, selectedId: null } : ds);
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
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.title}>🎂 Tortová Kalkulačka</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
            onClick={() => setIsCartOpen(!isCartOpen)}
            onMouseDown={(e) => e.preventDefault()}
            style={styles.cartButton}
            title="Košík"
          >
            🛒 {cart.length > 0 && <span style={styles.cartBadge}>{cart.length}</span>}
          </button>
          
          </div>
        </div>
      </header>

      <div style={styles.content} className="content">
          {loading && (
            <div style={{ minWidth: 200, marginBottom: '0.5rem' }}>Načítavam dáta…</div>
          )}
          {/* Dynamické sekcie (všetky sekcie z DB) */}
          {dynamicSections.map((dynSec) => (
            <section key={dynSec.key} style={styles.section}>
              <div style={styles.sectionTitleRow}>
                <h2 style={styles.sectionTitle}>{dynSec.label}{dynSec.required ? ' *' : ''}</h2>
                <button
                  className="toggle-btn"
                  aria-expanded={dynSec.isOpen}
                  onClick={() => {
                    setDynamicSections(prev => prev.map(ds => 
                      ds.key === dynSec.key ? { ...ds, isOpen: !ds.isOpen } : ds
                    ));
                  }}
                  style={{ ...styles.toggleButton, transform: dynSec.isOpen ? 'rotate(0deg)' : 'rotate(180deg)' }}
                  title={dynSec.isOpen ? 'Skryť sekciu' : 'Zobraziť sekciu'}
                >
                  ▾
                </button>
              </div>
              {dynSec.isOpen && (
                <>
                  {dynSec.description && !dynSec.description.toLowerCase().includes('spodny popis') && (
                    <div style={styles.sectionDescription}>{dynSec.description}</div>
                  )}
                  <div style={styles.sectionHeaderRow}>
                    <div style={styles.centerGroup}>
                      <select
                        value={dynSec.selectedId ?? ''}
                        onChange={(e) => {
                          const newId = e.target.value;
                          onSelectDynamic(dynSec.key, newId);
                        }}
                        style={{
                          ...styles.select,
                          border: (dynSec.required && !dynSec.selectedId && showRequiredHint) ? '2px solid #ff6b6b' : '2px solid #e0e6f0',
                          backgroundColor: (dynSec.required && !dynSec.selectedId && showRequiredHint) ? '#fff5f5' : '#ffffff',
                        }}
                      >
                        <option value="" disabled hidden>Vyberte možnosť</option>
                        {dynSec.options.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                      </select>
                      <div style={styles.priceBox}>
                        {(() => {
                          const selectedOpt = dynSec.options.find(o => o.id === dynSec.selectedId);
                          let price = selectedOpt?.price ?? 0;
                          const isLinkedForUI = Boolean(selectedOpt?.linkedRecipeId || recipesByName[selectedOpt?.name || '']);
                          if (selectedOpt && isLinkedForUI) {
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
                    </div>
                  </div>
                </>
              )}
            </section>
          ))}

        </div>

      {/* Cart Sidebar */}
      {isCartOpen && (
        <>
          <div style={styles.cartSidebar}>
            <div style={styles.cartHeader}>
              <h2 style={styles.cartTitle}>Košík ({cart.length})</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button onClick={() => setIsCartOpen(false)} style={styles.cartCloseBtn}>✕</button>
              </div>
            </div>
            <div style={styles.cartContent}>
              {cart.length === 0 ? (
                <p style={styles.cartEmpty}>Košík je prázdny</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                          // Before switching, remove any empty cart items (no selections),
                          // but keep the one we're switching to.
                          pruneEmptyCartItems(item.id);
                          setActiveItemId(item.id);
                        }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: activeItemId === item.id ? '#ffe0ea' : '#f8f9fa',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        border: activeItemId === item.id ? '2px solid #ff9fc4' : '2px solid transparent',
                        boxShadow: activeItemId === item.id ? '0 2px 6px rgba(255, 159, 196, 0.25)' : 'none',
                        transition: 'background-color 0.2s, border-color 0.2s',
                      }}
                    >
                      <div style={styles.breakdownList}>
                        {/* Render ALL dynamic selections */}
                        {item.dynamicSelections && Object.entries(item.dynamicSelections).map(([secKey, name]) => {
                          const dsec = dynamicSections.find(d => d.key === secKey);
                          const label = dsec?.label || secKey.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                          const opt = dsec?.options.find(o => o.name === name);
                          const basePrice = opt?.price ?? 0;
                          // Determine per-selection multiplier: prefer per-item diameter selection,
                          // otherwise fall back to globally selected diameter multipliers.
                          const isLinkedForUI = Boolean(opt?.linkedRecipeId || recipesByName[opt?.name || '']);
                          const appliedMult = isLinkedForUI ? findApplicableDiameterMultiplier(secKey, item) : 1;
                          const price = basePrice * appliedMult;
                          return (
                            <div key={`${item.id}-${secKey}`} style={styles.breakdownRow}>
                              <div style={styles.breakdownName}>{label}: {name}</div>
                              <div style={styles.breakdownPrice}>{price.toFixed(2)} €</div>
                              <button
                                style={styles.breakdownRemove}
                                onClick={() => removeDynamicPart(item.id, secKey)}
                                title="Zrušiť položku"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={styles.priceBare}>{(item.totalPrice * item.quantity).toFixed(2)} €</div>
                      </div>
                    </div>
                  ))}
                  {(() => {
                    const requiredSections = dynamicSections.filter(s => s.required);
                    const allHaveRequired = cart.every(it => requiredSections.every(ds => Boolean(it.dynamicSelections?.[ds.key])));
                    return (
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          // Prevent adding a new cake if any existing cake is empty (no selections)
                          const hasEmpty = cart.some(it => !(it.dynamicSelections && Object.values(it.dynamicSelections).some(Boolean)));
                          if (hasEmpty) {
                            // Show inline required hint instead of blocking alert
                            setShowRequiredHint(true);
                            return;
                          }
                          if (!allHaveRequired) {
                            setShowRequiredHint(true);
                            return;
                          }
                          const newItem: CartItem = {
                            id: Date.now().toString(),
                            dynamicSelections: {},
                            reward: 0,
                            totalPrice: 0,
                            quantity: 1,
                            eventName: `Torta #${cart.length + 1}`,
                          };
                          setCart(prev => [...prev, newItem]);
                          setActiveItemId(newItem.id);
                          setDynamicSections(prev => prev.map(ds => ({ ...ds, selectedId: null })));
                          setShowRequiredHint(false);
                        }}
                        style={styles.addCakeBtn}
                        title={allHaveRequired ? "Pridať ďalšiu tortu" : "Vyplňte všetky povinné polia vo všetkých tortách"}
                      >
                        + ďalšia torta
                      </button>
                    );
                  })()}
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const requiredSections = dynamicSections.filter(s => s.required);
                      const allHaveRequired = cart.every(it => requiredSections.every(ds => Boolean(it.dynamicSelections?.[ds.key])));
                      if (!allHaveRequired) {
                        setShowRequiredHint(true);
                        return;
                      }
                      exportCartToPDF();
                    }}
                    style={styles.pdfExportBtn}
                    title={(() => {
                      const requiredSections = dynamicSections.filter(s => s.required);
                      const allHaveRequired = cart.every(it => requiredSections.every(ds => Boolean(it.dynamicSelections?.[ds.key])));
                      return allHaveRequired ? 'Exportovať do PDF' : 'Vyplňte povinné polia vo všetkých tortách';
                    })()}
                  >
                    📄 Exportovať do PDF
                  </button>
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div style={styles.cartFooterElevated}>
                {(() => {
                  const requiredSections = dynamicSections.filter(s => s.required);
                  const allHaveRequired = cart.every(it => requiredSections.every(ds => Boolean(it.dynamicSelections?.[ds.key])));
                  return (
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (allHaveRequired) {
                          setIsEmailModalOpen(true);
                        } else {
                          // trigger required hint (red highlight) for missing ones
                          setShowRequiredHint(true);
                        }
                      }}
                      style={styles.totalButton}
                      title={allHaveRequired ? 'Záväzne objednať' : 'Vyplňte povinné polia pre každú tortu'}
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
    padding: '1rem 0',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  } as React.CSSProperties,
  title: {
    margin: 0,
    color: '#ffa9a9ff',
    fontSize: 'clamp(1.25rem, 3vw, 2rem)',
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
    overflowX: 'hidden',
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
    padding: '0.6rem 0.75rem',
    borderRadius: '6px',
    border: '2px solid #e0e6f0',
    background: '#ffffff',
    fontSize: '1rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#333',
    appearance: 'none',
    outline: 'none',
    boxShadow: 'none',
    position: 'relative',
    zIndex: 2,
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235b8fd9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.75rem center',
    backgroundSize: '20px',
    paddingRight: '2.5rem',
  } as React.CSSProperties,
  headerInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '720px',
    position: 'relative' as const,
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
    background: '#f1f7ff',
    color: '#0056b3',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.28rem 0.6rem',
    borderRadius: 6,
    border: '1px solid #e0eefc',
    minWidth: 72,
    textAlign: 'center' as const,
    fontSize: '0.95rem',
    height: '2rem',
    lineHeight: '2rem',
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
    color: '#ffc4d6',
  } as React.CSSProperties,
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
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
    border: '1px solid transparent',
    borderRadius: '50%',
    width: '34px',
    height: '34px',
    minWidth: '34px',
    flex: '0 0 34px',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#5b8fd9',
    display: 'flex' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    transformOrigin: '50% 50%',
    transition: 'transform 0.18s ease',
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
    justifyContent: 'space-between',
    gap: '1rem',
    padding: '0.4rem 0.75rem',
    backgroundColor: '#eaf3ff',
    borderRadius: 10,
    width: '90%',
  } as React.CSSProperties,
  breakdownName: {
    color: '#1a1a1a',
    fontSize: '0.95rem',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontWeight: 600,
  } as React.CSSProperties,
  breakdownPrice: {
    fontWeight: 600,
    color: '#0b6b5f',
    minWidth: '96px',
    textAlign: 'right' as const,
  } as React.CSSProperties,
  breakdownRemove: {
    background: '#6fa8ff',
    border: '1px solid #4a7dc9',
    color: '#1f1f1f',
    borderRadius: '6px',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    fontSize: '0.85rem',
    fontWeight: 700,
  } as React.CSSProperties,
  cartButton: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    boxShadow: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    position: 'absolute' as const,
    right: 0,
  } as React.CSSProperties,
  cartBadge: {
    position: 'absolute' as const,
    top: '5px',
    right: '6px',
    background: '#dc3545',
    color: 'white',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7rem',
    fontWeight: 'bold',
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
    width: '400px',
    maxWidth: '90vw',
    height: '100vh',
    backgroundColor: '#fff',
    zIndex: 1000,
    boxShadow: '-2px 0 10px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  cartHeader: {
    padding: '1rem',
    borderBottom: '1px solid #e6e6e9',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,
  cartTitle: {
    margin: 0,
    color: '#ffa9a9ff',
    fontSize: '1.5rem',
  } as React.CSSProperties,
  cartCloseBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#333',
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
    color: '#5b8fd9',
    border: 'none',
    outline: 'none',
    padding: '0.5rem 0',
    fontSize: '0.9rem',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontWeight: 500,
  } as React.CSSProperties,
  pdfExportBtn: {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#5b8fd9',
    color: '#fff',
    border: 'none',
    outline: 'none',
    borderRadius: '8px',
    fontSize: '0.95rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
  } as React.CSSProperties,
  
  priceBare: {
    marginLeft: 'auto',
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#333',
    padding: '0.25rem 0.5rem',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e6e6e9',
  } as React.CSSProperties,
  cartFooterElevated: {
    padding: '0.75rem 1rem',
    borderTop: '1px solid #e6e6e9',
    display: 'flex',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  totalButton: {
    background: 'linear-gradient(90deg, #ff8fb1, #ffc4d6)',
    color: '#5b1133',
    border: 'none',
    outline: 'none',
    borderRadius: '999px',
    padding: '0.85rem 1.5rem',
    fontSize: '1.15rem',
    fontWeight: 700,
    boxShadow: '0 4px 10px rgba(255, 143, 177, 0.35)',
    cursor: 'pointer',
    transform: 'translateY(-8px)',
    whiteSpace: 'nowrap' as const,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
