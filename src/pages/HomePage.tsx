import React, { useState, useEffect } from 'react';
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
  }

  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [isDiameterOpen, setIsDiameterOpen] = useState<boolean>(true);
  const [isHeightOpen, setIsHeightOpen] = useState<boolean>(false);
  const [selectedHeight, setSelectedHeight] = useState<string | null>(null);
  const [diameterPrice, setDiameterPrice] = useState<number | null>(null);
  const [heightPrice, setHeightPrice] = useState<number | null>(null);
  const [isInnerCreamOpen, setIsInnerCreamOpen] = useState<boolean>(false);
  const [isOtherCreamOpen, setIsOtherCreamOpen] = useState<boolean>(false);
  const [isExtraOpen, setIsExtraOpen] = useState<boolean>(false);
  const [isFruitOpen, setIsFruitOpen] = useState<boolean>(false);
  const [isDecorationsOpen, setIsDecorationsOpen] = useState<boolean>(false);
  const [isLogisticsOpen, setIsLogisticsOpen] = useState<boolean>(false);
  const [selectedInnerCream, setSelectedInnerCream] = useState<string | null>(null);
  const [selectedOtherCream, setSelectedOtherCream] = useState<string | null>(null);
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null);
  const [selectedFruit, setSelectedFruit] = useState<string | null>(null);
  const [selectedDecorations, setSelectedDecorations] = useState<string | null>(null);
  const [selectedLogistics, setSelectedLogistics] = useState<string | null>(null);
  const [rewardAmount, setRewardAmount] = useState<number>(0);
  const [isRewardOpen, setIsRewardOpen] = useState<boolean>(false);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
  // Admin emails loading is paused until notifications are wired

  interface CartItem {
    id: string;
    diameter: string;
    height: string;
    innerCream: string;
    outerCream: string;
    extra?: string;
    fruit?: string;
    decorations?: string;
    logistics: string;
    reward: number;
    totalPrice: number;
    quantity: number;
    eventName: string;
  }
  const [cart, setCart] = useState<CartItem[]>([]);

  // Real data from DB
  const [diameterOptions, setDiameterOptions] = useState<SectionOption[]>([]);
  const [heightOptions, setHeightOptions] = useState<SectionOption[]>([]);
  const [innerCreamOptions, setInnerCreamOptions] = useState<SectionOption[]>([]);
  const [outerCreamOptions, setOuterCreamOptions] = useState<SectionOption[]>([]);
  const [extraOptions, setExtraOptions] = useState<SectionOption[]>([]);
  const [fruitOptions, setFruitOptions] = useState<SectionOption[]>([]);
  const [decorationsOptions, setDecorationsOptions] = useState<SectionOption[]>([]);
  const [logisticsOptions, setLogisticsOptions] = useState<SectionOption[]>([]);

  const [innerCreamPrice, setInnerCreamPrice] = useState<number | null>(null);
  const [outerCreamPrice, setOuterCreamPrice] = useState<number | null>(null);
  const [extraPrice, setExtraPrice] = useState<number | null>(null);
  const [fruitPrice, setFruitPrice] = useState<number | null>(null);
  const [decorationsPrice, setDecorationsPrice] = useState<number | null>(null);
  const [logisticsPrice, setLogisticsPrice] = useState<number | null>(null);
  const [sectionMeta, setSectionMeta] = useState<Record<string, string>>({});

  // Vypočet celkovej ceny
  const totalPrice = 
    (diameterPrice ?? 0) + 
    (heightPrice ?? 0) + 
    (innerCreamPrice ?? 0) + 
    (outerCreamPrice ?? 0) + 
    (extraPrice ?? 0) + 
    (fruitPrice ?? 0) + 
    (decorationsPrice ?? 0) + 
    (logisticsPrice ?? 0) + 
    rewardAmount;

  useEffect(() => {
    loadAllSections();
    loadAdminEmails();
  }, []);

  // Helper to format price with default 0.00 € when not selected
  const fmt = (val: number | null) => `${(val ?? 0).toFixed(2)} €`;

  async function loadAllSections() {
    try {
      const { data, error } = await supabase
        .from('section_options')
        .select('*')
        .order('section', { ascending: true })
        .order('sort_order', { ascending: true });

      if (error) throw error;

      const opts = data || [];

      const diameter = opts.filter(o => o.section === 'diameter');
      const height = opts.filter(o => o.section === 'height');
      const innerCream = opts.filter(o => o.section === 'inner_cream');
      const outerCream = opts.filter(o => o.section === 'outer_cream');
      const extra = opts.filter(o => o.section === 'extra');
      const fruit = opts.filter(o => o.section === 'fruit');
      const decorations = opts.filter(o => o.section === 'decorations');
      const logistics = opts.filter(o => o.section === 'logistics');

      setDiameterOptions(diameter);
      setHeightOptions(height);
      setInnerCreamOptions(innerCream);
      setOuterCreamOptions(outerCream);
      setExtraOptions(extra);
      setFruitOptions(fruit);
      setDecorationsOptions(decorations);
      setLogisticsOptions(logistics);

      // Fetch bottom descriptions from section_meta
      const { data: meta, error: metaErr } = await supabase
        .from('section_meta')
        .select('section, description');
      if (metaErr) throw metaErr;
      const metaMap: Record<string, string> = {};
      (meta || []).forEach((m: any) => {
        if (m?.section) metaMap[m.section] = m.description || '';
      });
      setSectionMeta(metaMap);
    } catch (err) {
      console.error('Chyba pri načítaní sekcií:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadAdminEmails() {
    // No-op for now; notifications will be wired later
    return;
  }

  // Selection handlers with price updates
  function onSelectDiameter(id: string) {
    setSelectedSize(id);
    const opt = diameterOptions.find(o => o.id === id);
    setDiameterPrice(opt?.price ?? null);
  }

  function onSelectHeight(id: string) {
    setSelectedHeight(id);
    const opt = heightOptions.find(o => o.id === id);
    setHeightPrice(opt?.price ?? null);
  }

  function onSelectOuterCream(id: string) {
    setSelectedOtherCream(id);
    const opt = outerCreamOptions.find(o => o.id === id);
    setOuterCreamPrice(opt?.price ?? null);
  }

  function onSelectInnerCream(id: string) {
    setSelectedInnerCream(id);
    const opt = innerCreamOptions.find(o => o.id === id);
    setInnerCreamPrice(opt?.price ?? null);
  }

  function onSelectExtra(id: string) {
    setSelectedExtra(id);
    const opt = extraOptions.find(o => o.id === id);
    setExtraPrice(opt?.price ?? null);
  }

  function onSelectFruit(id: string) {
    setSelectedFruit(id);
    const opt = fruitOptions.find(o => o.id === id);
    setFruitPrice(opt?.price ?? null);
  }

  function onSelectDecorations(id: string) {
    setSelectedDecorations(id);
    const opt = decorationsOptions.find(o => o.id === id);
    setDecorationsPrice(opt?.price ?? null);
  }

  function onSelectLogistics(id: string) {
    setSelectedLogistics(id);
    const opt = logisticsOptions.find(o => o.id === id);
    setLogisticsPrice(opt?.price ?? null);
  }

  // Selected option objects for display
  const selectedDiameterObj = diameterOptions.find(o => o.id === selectedSize) || null;
  const selectedHeightObj = heightOptions.find(o => o.id === selectedHeight) || null;
  const selectedInnerCreamObj = innerCreamOptions.find(o => o.id === selectedInnerCream) || null;
  const selectedOuterCreamObj = outerCreamOptions.find(o => o.id === selectedOtherCream) || null;
  const selectedExtraObj = extraOptions.find(o => o.id === selectedExtra) || null;
  const selectedFruitObj = fruitOptions.find(o => o.id === selectedFruit) || null;
  const selectedDecorationsObj = decorationsOptions.find(o => o.id === selectedDecorations) || null;
  const selectedLogisticsObj = logisticsOptions.find(o => o.id === selectedLogistics) || null;

  const isValid = Boolean(selectedSize && selectedHeight && selectedInnerCream && selectedOtherCream && selectedLogistics);

  function addToCart() {
    if (!isValid) {
      alert('Prosím vyplňte všetky povinné polia:\n- Priemer torty\n- Výška torty\n- Vnútorný krém\n- Obterový krém\n- Logistika');
      return;
    }

    const newItem: CartItem = {
      id: Date.now().toString(),
      diameter: selectedDiameterObj?.name || '',
      height: selectedHeightObj?.name || '',
      innerCream: selectedInnerCreamObj?.name || '',
      outerCream: selectedOuterCreamObj?.name || '',
      extra: selectedExtraObj?.name || undefined,
      fruit: selectedFruitObj?.name || undefined,
      decorations: selectedDecorationsObj?.name || undefined,
      logistics: selectedLogisticsObj?.name || '',
      reward: rewardAmount,
      totalPrice,
      quantity: 1,
      eventName: `Torta #${cart.length + 1}`,
    };
    setCart(prev => [...prev, newItem]);
    setIsCartOpen(true);
  }

  async function handleCheckoutWithData(name: string, email: string) {
    if (cart.length === 0) return;
    const total = cart.reduce((sum, it) => sum + (it.totalPrice * it.quantity), 0);
    const items = cart.map((it) => ({
      eventName: it.eventName,
      quantity: it.quantity,
      diameter: it.diameter,
      height: it.height,
      innerCream: it.innerCream,
      outerCream: it.outerCream,
      extra: it.extra || null,
      fruit: it.fruit || null,
      decorations: it.decorations || null,
      logistics: it.logistics,
      reward: it.reward,
      unitPrice: it.totalPrice,
      lineTotal: it.totalPrice * it.quantity,
    }));
    try {
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

      console.log('Calling Edge Function with:', { customerEmail: email, customerName: name, items: emailItems, total });

      const { data: fnData, error: fnError } = await supabase.functions.invoke('send-order-email', {
        body: {
          customerEmail: email,
          customerName: name,
          items: emailItems,
          total,
        },
      });

      console.log('Edge Function response:', { fnData, fnError });

      if (fnError) {
        console.error('Edge Function error:', fnError);
        alert(`Objednávka bola uložená, ale email sa nepodarilo odoslať: ${fnError.message}`);
      } else {
        console.log('Emails sent successfully:', fnData);
      }

      setIsEmailModalOpen(false);
      setCart([]);
      setIsCartOpen(false);
      alert('Ďakujeme! Objednávka bola uložená a potvrdenie bolo odoslané na email.');
    } catch (e) {
      console.error('Supabase insert error:', e);
      const msg = (e as any)?.message || (e as any)?.error || 'Nepodarilo sa uložiť objednávku.';
      alert(msg);
    }
  }

  function removeCartItem(id: string) {
    setCart(prev => prev.filter(item => item.id !== id));
  }

  function increaseItemQuantity(id: string) {
    setCart(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: item.quantity + 1 } : item
    ));
  }

  function decreaseItemQuantity(id: string) {
    setCart(prev => prev.map(item => 
      item.id === id && item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : item
    ));
  }

  function updateEventName(id: string, name: string) {
    setCart(prev => prev.map(item => 
      item.id === id ? { ...item, eventName: name } : item
    ));
  }

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

      // Build price lookup maps for per-component pricing
      const priceBy: Record<string, Map<string, number>> = {
        diameter: new Map(diameterOptions.map(o => [o.name, o.price])),
        height: new Map(heightOptions.map(o => [o.name, o.price])),
        inner_cream: new Map(innerCreamOptions.map(o => [o.name, o.price])),
        outer_cream: new Map(outerCreamOptions.map(o => [o.name, o.price])),
        extra: new Map(extraOptions.map(o => [o.name, o.price])),
        fruit: new Map(fruitOptions.map(o => [o.name, o.price])),
        decorations: new Map(decorationsOptions.map(o => [o.name, o.price])),
        logistics: new Map(logisticsOptions.map(o => [o.name, o.price])),
      };
      const getP = (section: keyof typeof priceBy, name?: string | null) => (name ? (priceBy[section].get(name) ?? 0) : 0);

      cart.forEach((item, idx) => {
        if (y > 250) { doc.addPage(); y = 25; }

        // Item header background
        doc.setFillColor(240, 247, 255);
        doc.rect(15, y - 8, pageWidth - 30, 14, 'F');
        doc.setTextColor(0, 86, 179);
        doc.setFontSize(13);
        doc.text(`Torta #${idx + 1} (${item.quantity}x)`, 20, y);
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        doc.text(item.eventName, pageWidth - 20, y, { align: 'right' });
        y += 10;

        // Details with prices per component
        const details = [
          { label: 'Priemer:', value: item.diameter, price: getP('diameter', item.diameter) },
          { label: 'Výška:', value: item.height, price: getP('height', item.height) },
          { label: 'Vnútorný krém:', value: item.innerCream, price: getP('inner_cream', item.innerCream) },
          { label: 'Obterový krém:', value: item.outerCream, price: getP('outer_cream', item.outerCream) },
          item.extra ? { label: 'Extra:', value: item.extra, price: getP('extra', item.extra) } : null,
          item.fruit ? { label: 'Ovocie:', value: item.fruit, price: getP('fruit', item.fruit) } : null,
          item.decorations ? { label: 'Dekorácie:', value: item.decorations, price: getP('decorations', item.decorations) } : null,
          { label: 'Logistika:', value: item.logistics, price: getP('logistics', item.logistics) },
          item.reward > 0 ? { label: 'Odmena pre tvorcu:', value: '', price: item.reward } : null,
        ].filter(Boolean) as { label: string; value: string; price: number }[];

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


  // Auto-close breakdown when no items selected
  const hasAnySelected = Boolean(
    selectedDiameterObj ||
    selectedHeightObj ||
    selectedInnerCreamObj ||
    selectedOuterCreamObj ||
    selectedExtraObj ||
    selectedFruitObj ||
    selectedDecorationsObj ||
    selectedLogisticsObj
  );

  useEffect(() => {
    if (!hasAnySelected && isRewardOpen) {
      setIsRewardOpen(false);
    }
  }, [hasAnySelected]);

  // duplicates removed

  // totalPrice currently unused in UI (we show individual prices)

  return (
    <>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.title}>🎂 Tortová Kalkulačka</h1>
          <button
            onClick={() => setIsCartOpen(!isCartOpen)}
            onMouseDown={(e) => e.preventDefault()}
            style={styles.cartButton}
            title="Košík"
          >
            🛒 {cart.length > 0 && <span style={styles.cartBadge}>{cart.length}</span>}
          </button>
        </div>
      </header>

      <div style={styles.content} className="content">
          {/* Diameter section */}
          <section style={styles.section} className="section-card">
            <h2 style={styles.sectionTitle}>Priemer torty</h2>
            <div style={styles.sectionHeaderRow} className="section-row">
              <div style={styles.centerGroup} className="center-group">
                {loading ? (
                  <div style={{ minWidth: 200 }}>Načítavam...</div>
                ) : (
                  <select
                    value={selectedSize ?? ''}
                    onChange={(e) => onSelectDiameter(e.target.value)}
                    style={styles.select}
                  >
                    <option value="" disabled hidden>Vyberte priemer</option>
                    {diameterOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                )}
                <div style={styles.priceBox}>{fmt(diameterPrice)}</div>
                <button
                  className="toggle-btn"
                  aria-expanded={isDiameterOpen}
                  onClick={() => setIsDiameterOpen((v) => !v)}
                  style={{ transform: isDiameterOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  title={isDiameterOpen ? 'Skryť detaily' : 'Zobraziť detaily'}
                >
                  ▾
                </button>
              </div>
            </div>

            {isDiameterOpen && (
              <div style={styles.detailBubble}>
                <div style={styles.detailBubbleText}>{sectionMeta['diameter'] || 'Popis priemeru'}</div>
              </div>
            )}
          </section>

          {/* Height section */}
          <section style={styles.section} className="section-card">
            <h2 style={styles.sectionTitle}>Výška torty</h2>
            <div style={styles.sectionHeaderRow} className="section-row">
              <div style={styles.centerGroup} className="center-group">
                <select
                  value={selectedHeight ?? ''}
                  onChange={(e) => onSelectHeight(e.target.value)}
                  style={styles.select}
                >
                  <option value="" disabled hidden>Vyberte výšku</option>
                  {heightOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>

                <div style={styles.priceBox}>{fmt(heightPrice)}</div>

                <button
                  className="toggle-btn"
                  aria-expanded={isHeightOpen}
                  onClick={() => setIsHeightOpen((v) => !v)}
                  style={{ transform: isHeightOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  title={isHeightOpen ? 'Skryť detaily' : 'Zobraziť detaily'}
                >
                  ▾
                </button>
              </div>
            </div>

            {isHeightOpen && (
              <div style={styles.detailBubble}>
                <div style={styles.detailBubbleText}>{sectionMeta['height'] || 'Popis výšky'}</div>
              </div>
            )}
          </section>

          {/* Inner Cream section */}
          <section style={styles.section} className="section-card">
            <h2 style={styles.sectionTitle}>Vnútorný krém</h2>
            <div style={styles.sectionHeaderRow} className="section-row">
              <div style={styles.centerGroup} className="center-group">
                <select
                  value={selectedInnerCream ?? ''}
                  onChange={(e) => onSelectInnerCream(e.target.value)}
                  style={styles.select}
                >
                  <option value="" disabled hidden>Vyberte možnosť</option>
                  {innerCreamOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>

                <div style={styles.priceBox}>{fmt(innerCreamPrice)}</div>

                <button
                  className="toggle-btn"
                  aria-expanded={isInnerCreamOpen}
                  onClick={() => setIsInnerCreamOpen((v) => !v)}
                  style={{ transform: isInnerCreamOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  title={isInnerCreamOpen ? 'Skryť detaily' : 'Zobraziť detaily'}
                >
                  ▾
                </button>
              </div>
            </div>

            {isInnerCreamOpen && (
              <div style={styles.detailBubble}>
                <div style={styles.detailBubbleText}>{sectionMeta['inner_cream'] || 'Popis vnútorného krému'}</div>
              </div>
            )}
          </section>

          {/* Outer Cream section */}
          <section style={styles.section} className="section-card">
            <h2 style={styles.sectionTitle}>Obterový krém</h2>
            <div style={styles.sectionHeaderRow} className="section-row">
              <div style={styles.centerGroup} className="center-group">
                <select
                  value={selectedOtherCream ?? ''}
                  onChange={(e) => onSelectOuterCream(e.target.value)}
                  style={styles.select}
                >
                  <option value="" disabled hidden>Vyberte možnosť</option>
                  {outerCreamOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>

                <div style={styles.priceBox}>{fmt(outerCreamPrice)}</div>

                <button
                  className="toggle-btn"
                  aria-expanded={isOtherCreamOpen}
                  onClick={() => setIsOtherCreamOpen((v) => !v)}
                  style={{ transform: isOtherCreamOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  title={isOtherCreamOpen ? 'Skryť detaily' : 'Zobraziť detaily'}
                >
                  ▾
                </button>
              </div>
            </div>

            {isOtherCreamOpen && (
              <div style={styles.detailBubble}>
                <div style={styles.detailBubbleText}>{sectionMeta['outer_cream'] || 'Popis obterového krému'}</div>
              </div>
            )}
          </section>

          {/* Extra section */}
          <section style={styles.section} className="section-card">
            <h2 style={styles.sectionTitle}>Extra zložka</h2>
            <div style={styles.sectionHeaderRow} className="section-row">
              <div style={styles.centerGroup} className="center-group">
                <select
                  value={selectedExtra ?? ''}
                  onChange={(e) => onSelectExtra(e.target.value)}
                  style={styles.select}
                >
                  <option value="" disabled hidden>Vyberte možnosť</option>
                  {extraOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>

                <div style={styles.priceBox}>{fmt(extraPrice)}</div>

                <button
                  className="toggle-btn"
                  aria-expanded={isExtraOpen}
                  onClick={() => setIsExtraOpen((v) => !v)}
                  style={{ transform: isExtraOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  title={isExtraOpen ? 'Skryť detaily' : 'Zobraziť detaily'}
                >
                  ▾
                </button>
              </div>
            </div>

            {isExtraOpen && (
              <div style={styles.detailBubble}>
                <div style={styles.detailBubbleText}>{sectionMeta['extra'] || 'Popis extra zložky'}</div>
              </div>
            )}
          </section>

          {/* Fruit section */}
          <section style={styles.section} className="section-card">
            <h2 style={styles.sectionTitle}>Ovocie</h2>
            <div style={styles.sectionHeaderRow} className="section-row">
              <div style={styles.centerGroup} className="center-group">
                <select
                  value={selectedFruit ?? ''}
                  onChange={(e) => onSelectFruit(e.target.value)}
                  style={styles.select}
                >
                  <option value="" disabled hidden>Vyberte možnosť</option>
                  {fruitOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>

                <div style={styles.priceBox}>{fmt(fruitPrice)}</div>

                <button
                  className="toggle-btn"
                  aria-expanded={isFruitOpen}
                  onClick={() => setIsFruitOpen((v) => !v)}
                  style={{ transform: isFruitOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  title={isFruitOpen ? 'Skryť detaily' : 'Zobraziť detaily'}
                >
                  ▾
                </button>
              </div>
            </div>

            {isFruitOpen && (
              <div style={styles.detailBubble}>
                <div style={styles.detailBubbleText}>{sectionMeta['fruit'] || 'Popis ovocia'}</div>
              </div>
            )}
          </section>

          {/* Dekorácie section */}
          <section style={styles.section} className="section-card">
            <h2 style={styles.sectionTitle}>Dekorácie</h2>
            <div style={styles.sectionHeaderRow} className="section-row">
              <div style={styles.centerGroup} className="center-group">
                <select
                  value={selectedDecorations ?? ''}
                  onChange={(e) => onSelectDecorations(e.target.value)}
                  style={styles.select}
                >
                  <option value="" disabled hidden>Vyberte možnosť</option>
                  {decorationsOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>

                <div style={styles.priceBox}>{fmt(decorationsPrice)}</div>

                <button
                  className="toggle-btn"
                  aria-expanded={isDecorationsOpen}
                  onClick={() => setIsDecorationsOpen((v) => !v)}
                  style={{ transform: isDecorationsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  title={isDecorationsOpen ? 'Skryť detaily' : 'Zobraziť detaily'}
                >
                  ▾
                </button>
              </div>
            </div>

            {isDecorationsOpen && (
              <div style={styles.detailBubble}>
                <div style={styles.detailBubbleText}>{sectionMeta['decorations'] || 'Popis dekorácií'}</div>
              </div>
            )}
          </section>

          {/* Logistics section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Logistika</h2>
            <div style={styles.sectionHeaderRow}>
              <div style={styles.centerGroup}>
                <select
                  value={selectedLogistics ?? ''}
                  onChange={(e) => onSelectLogistics(e.target.value)}
                  style={styles.select}
                >
                  <option value="" disabled hidden>Vyberte možnosť</option>
                  {logisticsOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>

                <div style={styles.priceBox}>{fmt(logisticsPrice)}</div>

                <button
                  className="toggle-btn"
                  aria-expanded={isLogisticsOpen}
                  onClick={() => setIsLogisticsOpen((v) => !v)}
                  style={{ transform: isLogisticsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  title={isLogisticsOpen ? 'Skryť detaily' : 'Zobraziť detaily'}
                >
                  ▾
                </button>
              </div>
            </div>

            {isLogisticsOpen && (
              <div style={styles.detailBubble}>
                <div style={styles.detailBubbleText}>{sectionMeta['logistics'] || 'Popis logistiky'}</div>
              </div>
            )}
          </section>

          {/* Cena section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Cena</h2>
            
            <div style={styles.sectionHeaderRow}>
              <div style={styles.centerGroup}>
                {/* Compact slider with inline label and tooltip */}
                <div style={styles.rewardRow} className="reward-row">
                  <span style={styles.rewardLabel}>Odmena pre tvorcu</span>
                  <div style={styles.sliderWrap} className="slider-wrap">
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={0.01}
                      value={rewardAmount}
                      onChange={(e) => setRewardAmount(Number(e.target.value))}
                      style={styles.sliderSmall}
                    />
                    {/* Tooltip above thumb - centered perfectly */}
                    {(() => {
                      const min = 0;
                      const max = 50;
                      const percent = ((rewardAmount - min) / (max - min)) * 100;
                      return (
                        <div style={{
                          position: 'absolute',
                          left: `${percent}%`,
                          top: '-24px',
                          transform: 'translateX(-50%)',
                          background: '#ffffff',
                          border: '1px solid #e0e6f0',
                          borderRadius: '6px',
                          padding: '2px 6px',
                          fontSize: '0.75rem',
                          color: '#333',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                          pointerEvents: 'none',
                          whiteSpace: 'nowrap',
                          zIndex: 10,
                        }}>
                          {rewardAmount.toFixed(2)} €
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div style={styles.rightGroup} className="right-group">
                  <div style={styles.priceBoxTotal}>{`${totalPrice.toFixed(2)} €`}</div>
                  <button
                    className="toggle-btn"
                    aria-expanded={isRewardOpen}
                    onClick={() => setIsRewardOpen((v) => !v)}
                    style={{ transform: isRewardOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    title={isRewardOpen ? 'Skryť detaily' : 'Zobraziť detaily'}
                  >
                    ▾
                  </button>
                </div>
              </div>
            </div>

            {isRewardOpen && hasAnySelected && (
              <div style={styles.detailBubble}>
                <div style={styles.breakdownList}>
                  {selectedDiameterObj && (
                    <div style={styles.breakdownRow}>
                      <div style={styles.breakdownName}>{selectedDiameterObj.name}</div>
                      <div style={styles.breakdownPrice}>{(diameterPrice ?? 0).toFixed(2)} €</div>
                      <button
                        style={styles.breakdownRemove}
                        onClick={() => { setSelectedSize(null); setDiameterPrice(null); }}
                        title="Zrušiť položku"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {selectedHeightObj && (
                    <div style={styles.breakdownRow}>
                      <div style={styles.breakdownName}>{selectedHeightObj.name}</div>
                      <div style={styles.breakdownPrice}>{(heightPrice ?? 0).toFixed(2)} €</div>
                      <button
                        style={styles.breakdownRemove}
                        onClick={() => { setSelectedHeight(null); setHeightPrice(null); }}
                        title="Zrušiť položku"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {selectedInnerCreamObj && (
                    <div style={styles.breakdownRow}>
                      <div style={styles.breakdownName}>{selectedInnerCreamObj.name}</div>
                      <div style={styles.breakdownPrice}>{(innerCreamPrice ?? 0).toFixed(2)} €</div>
                      <button
                        style={styles.breakdownRemove}
                        onClick={() => { setSelectedInnerCream(null); setInnerCreamPrice(null); }}
                        title="Zrušiť položku"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {selectedOuterCreamObj && (
                    <div style={styles.breakdownRow}>
                      <div style={styles.breakdownName}>{selectedOuterCreamObj.name}</div>
                      <div style={styles.breakdownPrice}>{(outerCreamPrice ?? 0).toFixed(2)} €</div>
                      <button
                        style={styles.breakdownRemove}
                        onClick={() => { setSelectedOtherCream(null); setOuterCreamPrice(null); }}
                        title="Zrušiť položku"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {selectedExtraObj && (
                    <div style={styles.breakdownRow}>
                      <div style={styles.breakdownName}>{selectedExtraObj.name}</div>
                      <div style={styles.breakdownPrice}>{(extraPrice ?? 0).toFixed(2)} €</div>
                      <button
                        style={styles.breakdownRemove}
                        onClick={() => { setSelectedExtra(null); setExtraPrice(null); }}
                        title="Zrušiť položku"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {selectedFruitObj && (
                    <div style={styles.breakdownRow}>
                      <div style={styles.breakdownName}>{selectedFruitObj.name}</div>
                      <div style={styles.breakdownPrice}>{(fruitPrice ?? 0).toFixed(2)} €</div>
                      <button
                        style={styles.breakdownRemove}
                        onClick={() => { setSelectedFruit(null); setFruitPrice(null); }}
                        title="Zrušiť položku"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {selectedDecorationsObj && (
                    <div style={styles.breakdownRow}>
                      <div style={styles.breakdownName}>{selectedDecorationsObj.name}</div>
                      <div style={styles.breakdownPrice}>{(decorationsPrice ?? 0).toFixed(2)} €</div>
                      <button
                        style={styles.breakdownRemove}
                        onClick={() => { setSelectedDecorations(null); setDecorationsPrice(null); }}
                        title="Zrušiť položku"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {selectedLogisticsObj && (
                    <div style={styles.breakdownRow}>
                      <div style={styles.breakdownName}>{selectedLogisticsObj.name}</div>
                      <div style={styles.breakdownPrice}>{(logisticsPrice ?? 0).toFixed(2)} €</div>
                      <button
                        style={styles.breakdownRemove}
                        onClick={() => { setSelectedLogistics(null); setLogisticsPrice(null); }}
                        title="Zrušiť položku"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Add to Cart Button */}
          <section style={styles.section} className="section-card">
            <button
              onClick={addToCart}
              disabled={!isValid}
              style={{
                ...styles.addToCartButton,
                ...(isValid ? {} : styles.addToCartButtonDisabled),
              }}
            >
              🛒 Vložiť do košíka
            </button>
          </section>

        </div>

      {/* Cart Sidebar */}
      {isCartOpen && (
        <>
          <div style={styles.cartOverlay} onClick={() => setIsCartOpen(false)} />
          <div style={styles.cartSidebar}>
            <div style={styles.cartHeader}>
              <h2 style={styles.cartTitle}>Košík ({cart.length})</h2>
              <button onClick={() => setIsCartOpen(false)} style={styles.cartCloseBtn}>✕</button>
            </div>
            <div style={styles.cartContent}>
              {cart.length === 0 ? (
                <p style={styles.cartEmpty}>Košík je prázdny</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={styles.cartHeaderLabels}>
                    <div style={styles.headerLabel}>Počet</div>
                    <div style={styles.headerLabelCenter}>Udalosť</div>
                    <div style={styles.headerLabelRight}>Cena</div>
                  </div>
                  {cart.map((item) => (
                    <div key={item.id} style={styles.cartRowCompact}>
                      <div style={styles.qtyGroup}>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => decreaseItemQuantity(item.id)} style={styles.arrowBtn} title="Menej">‹</button>
                        <span style={styles.qtyNumber}>{item.quantity}x</span>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => increaseItemQuantity(item.id)} style={styles.arrowBtn} title="Viac">›</button>
                      </div>
                      <input
                        type="text"
                        value={item.eventName}
                        onChange={(e) => updateEventName(item.id, e.target.value)}
                        style={styles.cartItemInput}
                      />
                      <div style={styles.priceBare}>{(item.totalPrice * item.quantity).toFixed(2)} €</div>
                      <button onClick={() => removeCartItem(item.id)} style={styles.removeItemBtn} title="Odstrániť">✕</button>
                    </div>
                  ))}
                  <button onMouseDown={(e) => e.preventDefault()} onClick={exportCartToPDF} style={styles.pdfExportBtn} title="Exportovať do PDF">
                    📄 Exportovať do PDF
                  </button>
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div style={styles.cartFooterElevated}>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => setIsEmailModalOpen(true)} style={styles.totalButton} title="Záväzne objednať">
                  Záväzne objednať • {cart.reduce((sum, item) => sum + (item.totalPrice * item.quantity), 0).toFixed(2)} €
                </button>
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
    padding: '0.5rem 0.75rem',
    borderRadius: 8,
    border: '1px solid #e0eefc',
    minWidth: 80,
    textAlign: 'center' as const,
  } as React.CSSProperties,
  priceBoxSmall: {
    color: '#5b6b7a',
    fontSize: '0.9rem',
    minWidth: 100,
    textAlign: 'center' as const,
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
  detailBubble: {
    marginTop: '0.75rem',
    background: '#eaf4ff',
    border: '1px solid #d7ecff',
    padding: '0 0.75rem',
    borderRadius: '10px',
    minHeight: '46px',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  detailBubbleText: {
    color: '#063b66',
    fontSize: '0.95rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    width: '100%',
  } as React.CSSProperties,
  sectionTitle: {
    margin: 0,
    textAlign: 'left' as const,
    fontSize: '1.1rem',
    flex: '1',
    color: '#ffc4d6',
    marginBottom: '0.75rem',
  } as React.CSSProperties,
  toggleButton: {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '50%',
    width: '34px',
    height: '34px',
    minWidth: '34px',
    flex: '0 0 34px',
    fontSize: '0.85rem',
    cursor: 'pointer',
    color: '#5b8fd9',
    display: 'flex' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
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
  rewardRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flex: 1,
    flexWrap: 'wrap' as const,
    minWidth: 0,
  } as React.CSSProperties,
  rewardLabel: {
    fontSize: '0.85rem',
    color: '#64748b',
    whiteSpace: 'nowrap' as const,
    letterSpacing: '0.02em',
    fontWeight: 600,
  } as React.CSSProperties,
  sliderWrap: {
    position: 'relative' as const,
    flex: 1,
    minWidth: '120px',
    maxWidth: '350px',
    marginLeft: '0.25rem',
    marginRight: '0.25rem',
  } as React.CSSProperties,
  sliderSmall: {
    width: '100%',
    height: '6px',
    appearance: 'none' as const,
    background: '#e9edf3',
    borderRadius: '999px',
    outline: 'none',
  } as React.CSSProperties,
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginLeft: 'auto',
  } as React.CSSProperties,
  priceBoxTotal: {
    padding: '0.5rem 0.75rem',
    backgroundColor: '#ff69a5',
    border: '1px solid #ff4d94',
    color: '#ffffff',
    borderRadius: '8px',
    fontWeight: 700,
    minWidth: 80,
    textAlign: 'center' as const,
    boxShadow: '0 2px 4px rgba(255,105,165,0.3)',
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
    padding: '0.5rem 0.75rem',
    width: '100%',
  } as React.CSSProperties,
  breakdownRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    padding: '0.4rem 0.5rem',
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
  } as React.CSSProperties,
  breakdownName: {
    color: '#334155',
    fontSize: '0.95rem',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  breakdownPrice: {
    fontWeight: 600,
    color: '#0f766e',
    minWidth: '96px',
    textAlign: 'right' as const,
  } as React.CSSProperties,
  breakdownRemove: {
    background: '#f1f5f9',
    border: '1px solid #e2e8f0',
    color: '#475569',
    borderRadius: '6px',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    fontSize: '0.85rem',
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
  addToCartButton: {
    width: '100%',
    padding: '1rem',
    backgroundColor: '#ee59b5ff',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.2s',
  } as React.CSSProperties,
  addToCartButtonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
    opacity: 0.6,
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
  cartHeaderLabels: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '0.5rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #e6e6e9',
    marginBottom: '0.25rem',
  } as React.CSSProperties,
  headerLabel: {
    fontSize: '0.75rem',
    color: '#888',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    width: '95px',
  } as React.CSSProperties,
  headerLabelCenter: {
    fontSize: '0.75rem',
    color: '#888',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    flex: 1,
  } as React.CSSProperties,
  headerLabelRight: {
    fontSize: '0.75rem',
    color: '#888',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    width: '90px',
    textAlign: 'right' as const,
    paddingRight: '1.5rem',
  } as React.CSSProperties,
  cartEmpty: {
    textAlign: 'center' as const,
    color: '#999',
    padding: '2rem',
  } as React.CSSProperties,
  cartItem: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #e6e6e9',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
  } as React.CSSProperties,
  cartItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
  } as React.CSSProperties,
  cartItemRemove: {
    background: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '0.25rem 0.5rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
  } as React.CSSProperties,
  cartItemDetails: {
    fontSize: '0.9rem',
    color: '#666',
    marginBottom: '0.5rem',
  } as React.CSSProperties,
  cartItemPrice: {
    fontSize: '1.2rem',
    fontWeight: 'bold',
    color: '#28a745',
    textAlign: 'right' as const,
  } as React.CSSProperties,
  cartFooter: {
    padding: '1rem',
    borderTop: '1px solid #e6e6e9',
  } as React.CSSProperties,
  cartTotal: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    textAlign: 'right' as const,
    color: '#333',
  } as React.CSSProperties,
  cartTotalInline: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#333',
  } as React.CSSProperties,
  pdfButton: {
    padding: '0.75rem 1rem',
    backgroundColor: '#5b8fd9',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  } as React.CSSProperties,
  pdfIconButton: {
    width: '52px',
    height: '52px',
    borderRadius: '10px',
    border: '1px solid #e6e6e9',
    backgroundColor: '#ffffff',
    fontSize: '1.5rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 2px rgba(16,24,40,0.06)',
  } as React.CSSProperties,
  cartItemSummary: {
    flex: 1,
    fontSize: '0.9rem',
    color: '#555',
    fontWeight: 500,
  } as React.CSSProperties,
  cartItemInput: {
    width: '110px',
    fontSize: '0.85rem',
    color: '#333',
    fontWeight: 500,
    border: '1px solid #e6e6e9',
    borderRadius: '6px',
    padding: '0.3rem 0.4rem',
    backgroundColor: '#ffffff',
    outline: 'none',
  } as React.CSSProperties,
  removeItemBtn: {
    background: 'transparent',
    border: 'none',
    color: '#dc3545',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0 0.25rem',
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
  cartRowCompact: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
  } as React.CSSProperties,
  qtyGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.15rem',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '0.25rem 0.4rem',
    border: '1px solid #e6e6e9',
  } as React.CSSProperties,
  arrowBtn: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    boxShadow: 'none',
    color: '#333',
    fontSize: '1.1rem',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 0.2rem',
  } as React.CSSProperties,
  qtyNumber: {
    minWidth: '28px',
    textAlign: 'center' as const,
    fontWeight: 700,
    color: '#111',
    fontSize: '0.95rem',
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
