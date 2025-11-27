import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const SECTION_KEYS: Record<string, string> = {
  'Priemer torty': 'diameter',
  'Výška torty': 'height',
  'Vnútorný krém': 'inner_cream',
  'Obterový krém': 'outer_cream',
  'Extra zložka': 'extra',
  'Ovocie': 'fruit',
  'Dekorácie': 'decorations',
  'Logistika': 'logistics',
};

interface SectionOption {
  id?: string;
  name: string;
  price: number;
  description?: string;
}

interface SectionData {
  name: string;
  description?: string;
  options: SectionOption[];
}

export function AdminPanel() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Admin form state for sections
  const [sections, setSections] = useState<Record<string, SectionData>>({
    'Priemer torty': { name: 'Priemer torty', description: '', options: [] },
    'Výška torty': { name: 'Výška torty', description: '', options: [] },
    'Vnútorný krém': { name: 'Vnútorný krém', description: '', options: [] },
    'Obterový krém': { name: 'Obterový krém', description: '', options: [] },
    'Extra zložka': { name: 'Extra zložka', description: '', options: [] },
    'Ovocie': { name: 'Ovocie', description: '', options: [] },
    'Dekorácie': { name: 'Dekorácie', description: '', options: [] },
    'Logistika': { name: 'Logistika', description: '', options: [] },
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (user) {
      loadFromDb();
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

  async function loadFromDb() {
    try {
      // Fetch all section meta (bottom descriptions)
      const { data: meta, error: metaErr } = await supabase
        .from('section_meta')
        .select('section, description');
      if (metaErr) throw metaErr;

      // Fetch all options
      const { data: opts, error: optsErr } = await supabase
        .from('section_options')
        .select('id, section, name, price, description, sort_order')
        .order('section', { ascending: true })
        .order('sort_order', { ascending: true });
      if (optsErr) throw optsErr;

      // Build state structure
      setSections(() => {
        const next: Record<string, SectionData> = {};
        Object.keys(SECTION_KEYS).forEach((label) => {
          const key = SECTION_KEYS[label];
          const sectionDesc = meta?.find((m) => m.section === key)?.description || '';
          const sectionOptions = (opts || [])
            .filter((o) => o.section === key)
            .map((o) => ({ id: o.id, name: o.name || '', price: Number(o.price) || 0, description: o.description || '' }));
          next[label] = { name: label, description: sectionDesc, options: sectionOptions };
        });
        return next;
      });
    } catch (err) {
      console.error('Load from DB failed:', err);
      alert('⚠️ Nepodarilo sa načítať dáta z databázy');
    }
  }

  function addOption(sectionName: string) {
    setSections(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        options: [...prev[sectionName].options, { name: '', price: 0 }]
      }
    }));
  }

  function removeOption(sectionName: string, index: number) {
    setSections(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        options: prev[sectionName].options.filter((_, i) => i !== index)
      }
    }));
  }

  function updateOption(sectionName: string, index: number, field: 'name' | 'price' | 'description', value: any) {
    setSections(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        options: prev[sectionName].options.map((opt, i) => 
          i === index ? { ...opt, [field]: value } : opt
        )
      }
    }));
  }

  function updateSectionDescription(sectionName: string, value: string) {
    setSections(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        description: value,
      }
    }));
  }

  async function handleSaveAll() {
    setSaving(true);

    try {
      console.log('🔵 Začínam ukladanie...');
      
      // Save descriptions (section_meta) and options (section_options)
      for (const label of Object.keys(sections)) {
        const key = SECTION_KEYS[label];
        const section = sections[label];

        console.log(`📝 Ukladám sekciu: ${label} (${key})`, section);

        // Upsert section meta (one row per section)
        const { error: metaErr } = await supabase
          .from('section_meta')
          .upsert({ section: key, description: section.description || '' }, { onConflict: 'section' });
        if (metaErr) {
          console.error(`❌ Meta error pre ${label}:`, metaErr);
          throw metaErr;
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
        </div>
      </header>

      <div style={styles.content}>
          {/* Priemer torty section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Priemer torty</h2>
            <div style={styles.optionsContainer}>
              {sections['Priemer torty'].options.map((opt, idx) => (
                <div key={idx} style={styles.optionBox}>
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={opt.name}
                      onChange={(e) => updateOption('Priemer torty', idx, 'name', e.target.value)}
                      style={styles.inputField}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena €"
                      value={opt.price}
                      onChange={(e) => updateOption('Priemer torty', idx, 'price', parseFloat(e.target.value) || 0)}
                      style={styles.inputField}
                    />
                    <button
                      onClick={() => removeOption('Priemer torty', idx)}
                      style={styles.removeButton}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => addOption('Priemer torty')}
              style={styles.addButton}
            >
              + Pridať možnosť
            </button>
            <div style={styles.descriptionSection}>
              <textarea
                placeholder={"Spodný popis sekcie"}
                value={sections['Priemer torty'].description || ''}
                onChange={(e) => updateSectionDescription('Priemer torty', e.target.value)}
                style={styles.descriptionField}
              />
            </div>
          </section>

          {/* Výška torty section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Výška torty</h2>
            <div style={styles.optionsContainer}>
              {sections['Výška torty'].options.map((opt, idx) => (
                <div key={idx} style={styles.optionBox}>
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={opt.name}
                      onChange={(e) => updateOption('Výška torty', idx, 'name', e.target.value)}
                      style={styles.inputField}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena €"
                      value={opt.price}
                      onChange={(e) => updateOption('Výška torty', idx, 'price', parseFloat(e.target.value) || 0)}
                      style={styles.inputField}
                    />
                    <button
                      onClick={() => removeOption('Výška torty', idx)}
                      style={styles.removeButton}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => addOption('Výška torty')}
              style={styles.addButton}
            >
              + Pridať možnosť
            </button>
            <div style={styles.descriptionSection}>
              <textarea
                placeholder={"Spodný popis sekcie"}
                value={sections['Výška torty'].description || ''}
                onChange={(e) => updateSectionDescription('Výška torty', e.target.value)}
                style={styles.descriptionField}
              />
            </div>
          </section>

          {/* Vnútorný krém section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Vnútorný krém</h2>
            <div style={styles.optionsContainer}>
              {sections['Vnútorný krém'].options.map((opt, idx) => (
                <div key={idx} style={styles.optionBox}>
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={opt.name}
                      onChange={(e) => updateOption('Vnútorný krém', idx, 'name', e.target.value)}
                      style={styles.inputField}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena €"
                      value={opt.price}
                      onChange={(e) => updateOption('Vnútorný krém', idx, 'price', parseFloat(e.target.value) || 0)}
                      style={styles.inputField}
                    />
                    <button
                      onClick={() => removeOption('Vnútorný krém', idx)}
                      style={styles.removeButton}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => addOption('Vnútorný krém')}
              style={styles.addButton}
            >
              + Pridať možnosť
            </button>
            <div style={styles.descriptionSection}>
              <textarea
                placeholder={"Spodný popis sekcie"}
                value={sections['Vnútorný krém'].description || ''}
                onChange={(e) => updateSectionDescription('Vnútorný krém', e.target.value)}
                style={styles.descriptionField}
              />
            </div>
          </section>

          {/* Obterový krém section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Obterový krém</h2>
            <div style={styles.optionsContainer}>
              {sections['Obterový krém'].options.map((opt, idx) => (
                <div key={idx} style={styles.optionBox}>
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={opt.name}
                      onChange={(e) => updateOption('Obterový krém', idx, 'name', e.target.value)}
                      style={styles.inputField}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena €"
                      value={opt.price}
                      onChange={(e) => updateOption('Obterový krém', idx, 'price', parseFloat(e.target.value) || 0)}
                      style={styles.inputField}
                    />
                    <button
                      onClick={() => removeOption('Obterový krém', idx)}
                      style={styles.removeButton}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => addOption('Obterový krém')}
              style={styles.addButton}
            >
              + Pridať možnosť
            </button>
            <div style={styles.descriptionSection}>
              <textarea
                placeholder={"Spodný popis sekcie"}
                value={sections['Obterový krém'].description || ''}
                onChange={(e) => updateSectionDescription('Obterový krém', e.target.value)}
                style={styles.descriptionField}
              />
            </div>
          </section>

          {/* Extra zložka section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Extra zložka</h2>
            <div style={styles.optionsContainer}>
              {sections['Extra zložka'].options.map((opt, idx) => (
                <div key={idx} style={styles.optionBox}>
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={opt.name}
                      onChange={(e) => updateOption('Extra zložka', idx, 'name', e.target.value)}
                      style={styles.inputField}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena €"
                      value={opt.price}
                      onChange={(e) => updateOption('Extra zložka', idx, 'price', parseFloat(e.target.value) || 0)}
                      style={styles.inputField}
                    />
                    <button
                      onClick={() => removeOption('Extra zložka', idx)}
                      style={styles.removeButton}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => addOption('Extra zložka')}
              style={styles.addButton}
            >
              + Pridať možnosť
            </button>
            <div style={styles.descriptionSection}>
              <textarea
                placeholder={"Spodný popis sekcie"}
                value={sections['Extra zložka'].description || ''}
                onChange={(e) => updateSectionDescription('Extra zložka', e.target.value)}
                style={styles.descriptionField}
              />
            </div>
          </section>

          {/* Ovocie section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Ovocie</h2>
            <div style={styles.optionsContainer}>
              {sections['Ovocie'].options.map((opt, idx) => (
                <div key={idx} style={styles.optionBox}>
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={opt.name}
                      onChange={(e) => updateOption('Ovocie', idx, 'name', e.target.value)}
                      style={styles.inputField}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena €"
                      value={opt.price}
                      onChange={(e) => updateOption('Ovocie', idx, 'price', parseFloat(e.target.value) || 0)}
                      style={styles.inputField}
                    />
                    <button
                      onClick={() => removeOption('Ovocie', idx)}
                      style={styles.removeButton}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => addOption('Ovocie')}
              style={styles.addButton}
            >
              + Pridať možnosť
            </button>
            <div style={styles.descriptionSection}>
              <textarea
                placeholder={"Spodný popis sekcie"}
                value={sections['Ovocie'].description || ''}
                onChange={(e) => updateSectionDescription('Ovocie', e.target.value)}
                style={styles.descriptionField}
              />
            </div>
          </section>

          {/* Dekorácie section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Dekorácie</h2>
            <div style={styles.optionsContainer}>
              {sections['Dekorácie'].options.map((opt, idx) => (
                <div key={idx} style={styles.optionBox}>
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={opt.name}
                      onChange={(e) => updateOption('Dekorácie', idx, 'name', e.target.value)}
                      style={styles.inputField}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena €"
                      value={opt.price}
                      onChange={(e) => updateOption('Dekorácie', idx, 'price', parseFloat(e.target.value) || 0)}
                      style={styles.inputField}
                    />
                    <button
                      onClick={() => removeOption('Dekorácie', idx)}
                      style={styles.removeButton}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => addOption('Dekorácie')}
              style={styles.addButton}
            >
              + Pridať možnosť
            </button>
            <div style={styles.descriptionSection}>
              <textarea
                placeholder={"Spodný popis sekcie"}
                value={sections['Dekorácie'].description || ''}
                onChange={(e) => updateSectionDescription('Dekorácie', e.target.value)}
                style={styles.descriptionField}
              />
            </div>
          </section>

          {/* Logistika section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Logistika</h2>
            <div style={styles.optionsContainer}>
              {sections['Logistika'].options.map((opt, idx) => (
                <div key={idx} style={styles.optionBox}>
                  <div style={styles.optionRow}>
                    <input
                      type="text"
                      placeholder="Názov"
                      value={opt.name}
                      onChange={(e) => updateOption('Logistika', idx, 'name', e.target.value)}
                      style={styles.inputField}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cena €"
                      value={opt.price}
                      onChange={(e) => updateOption('Logistika', idx, 'price', parseFloat(e.target.value) || 0)}
                      style={styles.inputField}
                    />
                    <button
                      onClick={() => removeOption('Logistika', idx)}
                      style={styles.removeButton}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => addOption('Logistika')}
              style={styles.addButton}
            >
              + Pridať možnosť
            </button>
            <div style={styles.descriptionSection}>
              <textarea
                placeholder={"Spodný popis sekcie"}
                value={sections['Logistika'].description || ''}
                onChange={(e) => updateSectionDescription('Logistika', e.target.value)}
                style={styles.descriptionField}
              />
            </div>
          </section>

          {/* Save section at bottom */}
          <div style={styles.saveSection}>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              style={styles.saveButton}
            >
              {saving ? 'Ukladám...' : '💾 Uložiť všetky zmeny'}
            </button>
            <button onClick={handleLogout} style={styles.logoutButton}>
              Odhlásiť
            </button>
          </div>
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
    padding: '1rem',
  } as React.CSSProperties,
  section: {
    marginBottom: '0.5rem',
    backgroundColor: '#ffffff',
    border: '1px solid #e6e6e9',
    borderRadius: '10px',
    padding: '0.75rem 1rem',
    boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    width: '100%',
  } as React.CSSProperties,
  sectionTitle: {
    margin: '0 0 1rem 0',
    color: '#ffc4d6',
    fontSize: '1.1rem',
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
    backgroundColor: '#525252ff',
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
    padding: '0.875rem 2rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    minWidth: '250px',
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
};
