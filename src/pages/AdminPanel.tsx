import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface SectionOption {
  id?: string;
  name: string;
  price: number;
  description?: string;
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
    }
    const [visitStats, setVisitStats] = useState<VisitStats>({
      total: 0,
      last24h: 0,
      uniqueIps: 0,
      byDay: [],
    });
    const [loadingStats, setLoadingStats] = useState(false);

  // Admin form state for sections (keyed by DB key, not label)
  const [sections, setSections] = useState<Record<string, SectionData>>({});

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'UI' | 'Recepty' | 'Ingrediencie' | 'Navstevnost'>('UI');

  // Ingredients state
  type Unit = 'ml' | 'g' | 'l' | 'kg' | 'ks';
  interface Ingredient { id?: string; name: string; unit: Unit; price: number }
  const UNITS: Unit[] = ['ml','g','l','kg','ks'];
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

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

        setVisitStats({
          total: total ?? 0,
          last24h: last24h ?? 0,
          uniqueIps,
          byDay,
        });
      } catch (err) {
        console.error('Error loading visit stats:', err);
      } finally {
        setLoadingStats(false);
      }
    }

  async function loadFromDb() {
    try {
      // Fetch all section meta (bottom descriptions)
      let meta: any[] | null = null;
      let metaErr: any = null;
      {
        const { data, error } = await supabase
          .from('section_meta')
          .select('section, description, required');
        meta = data as any[] | null;
        metaErr = error;
      }
      if (metaErr) {
        const { data, error } = await supabase
          .from('section_meta')
          .select('section, description');
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
        .select('id, name, unit, price')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setIngredients((data || []).map((r: any) => ({
        id: r.id,
        name: r.name || '',
        unit: (r.unit as Unit) || 'ml',
        price: Number(r.price) || 0,
      })));
    } catch (err) {
      console.error('Load ingredients failed:', err);
    }
  }

  function addIngredient() {
    setIngredients(prev => [...prev, { name: '', unit: 'ml', price: 0 }]);
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

  function updateOption(sectionKey: string, index: number, field: 'name' | 'price' | 'description', value: any) {
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
      [key]: { name: label, description: '', required: false, options: [] }
    }));
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
      console.log('🔵 Začínam ukladanie...');
      // Fetch existing sections in DB to detect deletions
      const { data: existingMeta, error: existingMetaErr } = await supabase
        .from('section_meta')
        .select('section');
      if (existingMetaErr) throw existingMetaErr;
      const existingKeys = new Set<string>((existingMeta || []).map(m => m.section));
      
      // Save descriptions (section_meta) and options (section_options)
      for (const key of Object.keys(sections)) {
        const section = sections[key];
        const label = keyToLabel[key] || key;

        console.log(`📝 Ukladám sekciu: ${label} (${key})`, section);

        // Upsert section meta (one row per section)
        let metaErr: any = null;
        try {
          const { error } = await supabase
            .from('section_meta')
            .upsert({ section: key, description: section.description || '', required: Boolean(section.required) }, { onConflict: 'section' });
          metaErr = error;
          if (metaErr) throw metaErr;
        } catch (_) {
          const { error } = await supabase
            .from('section_meta')
            .upsert({ section: key, description: section.description || '' }, { onConflict: 'section' });
          if (error) {
            console.error(`❌ Meta error pre ${label}:`, error);
            throw error;
          }
        }

        // Replace options for the section for simplicity
        const { error: delErr } = await supabase
          .from('section_options')
          .delete()
          .eq('section', key);
        if (delErr) {
          console.error(`❌ Delete error pre ${label}:`, delErr);
          throw delErr;
        }

        if (section.options.length) {
          const rows = section.options.map((opt, idx) => ({
            section: key,
            name: opt.name,
            price: opt.price,
            description: opt.description || '',
            sort_order: idx,
          }));
          
          console.log(`➕ Vkladám ${rows.length} možností pre ${label}:`, rows);
          
          const { error: insErr } = await supabase
            .from('section_options')
            .insert(rows);
          if (insErr) {
            console.error(`❌ Insert error pre ${label}:`, insErr);
            throw insErr;
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

      console.log('🎉 Všetko uložené!');
      alert('✅ Zmeny úspešne uložené do databázy!');
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
          {Object.keys(sections).map((sectionKey) => {
            const section = sections[sectionKey];
            const label = keyToLabel[sectionKey] || sectionKey;
            return (
              <section key={sectionKey} style={{
                ...styles.section,
                backgroundColor: '#fff',
                border: `2px solid ${currentColors.border}`,
              }}>
                <div style={styles.sectionHeader}>
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
                      color: currentColors.text,
                      margin: 0,
                      border: '1px solid ' + currentColors.border,
                      borderRadius: '6px',
                      padding: '0.25rem 0.5rem',
                    }}
                  />
                  <button
                    onClick={() => removeSection(sectionKey)}
                    style={styles.removeSectionButton}
                    title="Odstrániť sekciu"
                  >
                    ✕
                  </button>
                </div>
                <div style={styles.optionsContainer}>
                  {section.options.map((opt, idx) => (
                    <div key={idx} style={styles.optionBox}>
                      <div style={styles.optionRow}>
                        <input
                          type="text"
                          placeholder="Názov"
                          value={opt.name}
                          onChange={(e) => updateOption(sectionKey, idx, 'name', e.target.value)}
                          style={styles.inputField}
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Cena €"
                          value={opt.price}
                          onChange={(e) => updateOption(sectionKey, idx, 'price', parseFloat(e.target.value) || 0)}
                          style={styles.inputField}
                        />
                        <button
                          onClick={() => removeOption(sectionKey, idx)}
                          style={styles.removeButton}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => addOption(sectionKey)}
                  style={styles.addButton}
                >
                  + Pridať možnosť
                </button>
                <label style={{ marginLeft: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(section.required)}
                    onChange={(e) => setSections(prev => ({
                      ...prev,
                      [sectionKey]: { ...prev[sectionKey], required: e.target.checked }
                    }))}
                  />
                  <span>Povinné pole</span>
                </label>
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
          <div style={styles.emptyTab}>
            <p style={styles.emptyTabText}>Recepty - obsah zatiaľ nie je k dispozícii</p>
          </div>
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
                <div key={ing.id ?? `new-${idx}`} style={styles.optionBox}>
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={ing.name}
                      onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                      style={styles.inputField}
                    />
                    <select
                      value={ing.unit}
                      onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                      style={styles.inputField}
                    >
                      {UNITS.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena €"
                      value={ing.price}
                      onChange={(e) => updateIngredient(idx, 'price', parseFloat(e.target.value) || 0)}
                      style={styles.inputField}
                    />
                    <button onClick={() => removeIngredient(idx)} style={styles.removeButton}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addIngredient} style={styles.addButton}>+ Ďalší produkt</button>
          </section>
        )}

        {/* Tab Content: Navstevnost */}
        {activeTab === 'Navstevnost' && (
          <div style={styles.visitStatsTab}>
            <h2 style={styles.visitStatsTitle}>📊 Návštevnosť stránky</h2>
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
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

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
    margin: '0 0 1rem 0',
    color: '#ffc4d6',
    fontSize: '1.1rem',
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  } as React.CSSProperties,
  removeSectionButton: {
    padding: '0.4rem 0.6rem',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    transition: 'all 0.2s ease',
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
    padding: '0.75rem',
    backgroundColor: '#f9f9f9',
    borderRadius: '6px',
    border: '1px solid #e0e6f0',
  } as React.CSSProperties,
  inputField: {
    flex: 1,
    minWidth: '120px',
    padding: '0.6rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #e0e6f0',
    fontSize: '1rem',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  descriptionField: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box' as const,
    padding: '0.6rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #e0e6f0',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    minHeight: '60px',
    resize: 'vertical' as const,
    overflowX: 'hidden' as const,
    backgroundColor: '#70a3f0ff',
  } as React.CSSProperties,
  removeButton: {
    padding: '0.6rem 0.75rem',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1rem',
    minWidth: '40px',
  } as React.CSSProperties,
  descriptionBox: {
    display: 'flex',
    gap: '0.5rem',
  } as React.CSSProperties,
  addButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1rem',
    marginTop: '1rem',
    marginBottom: '1rem',
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
