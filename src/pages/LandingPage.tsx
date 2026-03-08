import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/* ─── FAQ data ─── */
const faqItems = [
  {
    q: 'Musím mať technické znalosti?',
    a: 'Vôbec nie. Systém je navrhnutý tak, aby ste ho zvládli ovládať bez akýchkoľvek technických znalostí. Stačí sa zaregistrovať a môžete začať.',
  },
  {
    q: 'Môžem si systém vyskúšať zadarmo?',
    a: 'Áno! Plán Trial je úplne zadarmo na 14 dní. Nepotrebujete zadávať platobnú kartu.',
  },
  {
    q: 'Ako zákazníci nájdu moju stránku?',
    a: 'Po registrácii dostanete vlastný odkaz (napr. upecsitortu.sk/vasacukraren), ktorý môžete zdieľať na sociálnych sieťach, vizitke, alebo kdekoľvek.',
  },
  {
    q: 'Môžem zmeniť vzhľad svojej stránky?',
    a: 'Samozrejme. V admin paneli si môžete vybrať farebnú tému, nahrať logo a prispôsobiť ponuku podľa seba.',
  },
  {
    q: 'Aké platobné metódy akceptujete?',
    a: 'V súčasnosti podporujeme bankový prevod. Platba kartou a ďalšie metódy sú vo vývoji.',
  },
  {
    q: 'Môžem systém zrušiť kedykoľvek?',
    a: 'Áno, nie ste viazaný žiadnou zmluvou. Môžete zrušiť kedykoľvek bez poplatkov.',
  },
];

/* ─── Pricing plans ─── */
const plans = [
  {
    name: 'Trial',
    price: '0 €',
    period: '14 dní zadarmo',
    features: [
      'Vlastná stránka s odkazom',
      'Až 10 produktov',
      'Príjem objednávok emailom',
      'Základná farebná téma',
    ],
    cta: 'Vyskúšať zadarmo',
    highlighted: false,
    action: 'register',
  },
  {
    name: 'Pro',
    price: '9,90 €',
    period: '/ mesiac',
    features: [
      'Neobmedzené produkty',
      'Vlastné logo a farby',
      'PDF objednávky',
      'Prioritná podpora',
      'Štatistiky návštevnosti',
    ],
    cta: 'Začať teraz',
    highlighted: true,
    action: 'wip',
  },
  {
    name: 'Custom',
    price: '19,90 €',
    period: '/ mesiac',
    features: [
      'Všetko v Pro',
      'Vlastná doména',
      'Online platby',
      'Rozšírené štatistiky',
      'API prístup',
      'Prednostný vývoj funkcií',
    ],
    cta: 'Kontaktovať nás',
    highlighted: false,
    action: 'wip',
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  /* ─── Registration state ─── */
  const [showRegModal, setShowRegModal] = useState(false);
  const [regBakeryName, setRegBakeryName] = useState('');
  const [regSlug, setRegSlug] = useState('');
  const [regSlugEdited, setRegSlugEdited] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showPwdConfirm, setShowPwdConfirm] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);
  const [regCreatedSlug, setRegCreatedSlug] = useState('');

  const slugify = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const handleBakeryNameChange = (val: string) => {
    setRegBakeryName(val);
    if (!regSlugEdited) setRegSlug(slugify(val));
  };

  const handleSlugChange = (val: string) => {
    setRegSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    setRegSlugEdited(true);
  };

  const openRegModal = () => {
    setRegBakeryName('');
    setRegSlug('');
    setRegSlugEdited(false);
    setRegEmail('');
    setRegPassword('');
    setRegPasswordConfirm('');
    setShowPwd(false);
    setShowPwdConfirm(false);
    setRegError('');
    setRegSuccess(false);
    setShowRegModal(true);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (regPassword !== regPasswordConfirm) {
      setRegError('Heslá sa nezhodujú.');
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(regSlug) || regSlug.length < 2) {
      setRegError('Slug musí mať aspoň 2 znaky a môže obsahovať iba malé písmená, číslice a pomlčky.');
      return;
    }

    setRegLoading(true);

    /* Sign up */
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: regEmail,
      password: regPassword,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes('rate limit') || msg.includes('too many') || authError.status === 429) {
        setRegError('Príliš veľa pokusov o registráciu. Počkajte prosím ~1 hodinu a skúste znova, alebo použite iný email.');
      } else if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
        setRegError('Tento email je už zaregistrovaný. Prihláste sa alebo použite iný email.');
      } else if (msg.includes('invalid email')) {
        setRegError('Neplatný email.');
      } else if (msg.includes('password') && msg.includes('short')) {
        setRegError('Heslo musí mať aspoň 6 znakov.');
      } else {
        setRegError(`Chyba: ${authError.message}`);
      }
      setRegLoading(false);
      return;
    }

    const userId = authData.user?.id;
    if (!userId) {
      setRegError('Registrácia zlyhala. Skúste to znova.');
      setRegLoading(false);
      return;
    }

    // Supabase returns a fake success for already-registered emails (empty identities)
    if ((authData.user?.identities?.length ?? 1) === 0) {
      setRegError('Tento email je už zaregistrovaný. Prihláste sa alebo použite iný email.');
      setRegLoading(false);
      return;
    }

    /* Call edge function with service role — bypasses RLS, works with or without session */
    const { data: fnData, error: fnError } = await supabase.functions.invoke('register-bakery', {
      body: { bakeryName: regBakeryName, slug: regSlug, email: regEmail, userId },
    });

    if (fnError) {
      // Extract actual error message from edge function response body
      let msg = fnError.message ?? 'Neznáma chyba';
      try {
        const body = await (fnError as any).context?.json?.();
        if (body?.error) msg = body.error;
      } catch { /* ignore parse errors */ }
      setRegError(msg);
      setRegLoading(false);
      return;
    }
    if (fnData?.error) {
      setRegError(fnData.error);
      setRegLoading(false);
      return;
    }

    setRegLoading(false);

    // If email confirmation is disabled, Supabase returns a session immediately → auto-login
    if (authData.session) {
      navigate('/admin');
      return;
    }

    // Email confirmation required — show success screen
    setRegCreatedSlug(regSlug);
    setRegSuccess(true);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing">
      {/* ─── NAVBAR ─── */}
      <nav className="landing-nav">
        <div className="landing-nav__inner">
          <div className="landing-nav__logo" onClick={() => scrollTo('hero')}>
            Upeč si cenu
          </div>
          <div className="landing-nav__links">
            <button onClick={() => scrollTo('how')}>Ako to funguje</button>
            <button onClick={() => scrollTo('features')}>Funkcie</button>
            <button onClick={() => scrollTo('pricing')}>Cenník</button>
            <button onClick={() => scrollTo('faq')}>FAQ</button>
          </div>
          <div className="landing-nav__actions">
            <button className="landing-btn--ghost" onClick={() => navigate('/admin')}>
              Prihlásiť sa
            </button>
            <button className="landing-btn--primary" onClick={openRegModal}>
              Registrovať sa
            </button>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="landing-hero" id="hero">
        <div className="landing-hero__content">
          <span className="landing-hero__badge">✨ Jednoduché. Rýchle. Moderné.</span>
          <h1 className="landing-hero__title">
            Online objednávkový systém<br />
            <span className="landing-hero__highlight">pre cukrárne</span>
          </h1>
          <p className="landing-hero__subtitle">
            Vytvorte si vlastnú stránku s ponukou, prijímajte objednávky a spravujte svoju cukráreň –
            všetko na jednom mieste. Žiadne kódovanie, žiadne starosti.
          </p>
          <div className="landing-hero__ctas">
            <button className="landing-btn--primary landing-btn--lg" onClick={openRegModal}>
              Vyskúšať zadarmo
            </button>
            <button className="landing-btn--outline landing-btn--lg" onClick={() => scrollTo('how')}>
              Ako to funguje?
            </button>
          </div>
          <p className="landing-hero__note">Bez kreditnej karty · Nastavenie za 2 minúty</p>
        </div>
        <div className="landing-hero__visual">
          <div className="landing-hero__mockup">
            <div className="landing-hero__mockup-bar">
              <span /><span /><span />
            </div>
            <div className="landing-hero__mockup-body">
              <div className="landing-hero__mockup-card">🎂 Čokoládová torta<br /><strong>24,90 €</strong></div>
              <div className="landing-hero__mockup-card">🍰 Ovocná torta<br /><strong>22,50 €</strong></div>
              <div className="landing-hero__mockup-card">🧁 Cupcakes (6ks)<br /><strong>12,00 €</strong></div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── AKO TO FUNGUJE ─── */}
      <section className="landing-section" id="how">
        <h2 className="landing-section__title">Ako to funguje?</h2>
        <p className="landing-section__subtitle">Tri jednoduché kroky a ste online.</p>
        <div className="landing-steps">
          {[
            { icon: '📝', title: 'Zaregistrujte sa', desc: 'Vyplňte meno cukrárne a email. Hotové za minútu.' },
            { icon: '🎨', title: 'Nastavte si ponuku', desc: 'Pridajte produkty, ceny, fotky a vyberte si farby.' },
            { icon: '📦', title: 'Prijímajte objednávky', desc: 'Zdieľajte odkaz a objednávky vám chodia na email.' },
          ].map((step, i) => (
            <div className="landing-step" key={i}>
              <div className="landing-step__number">{i + 1}</div>
              <div className="landing-step__icon">{step.icon}</div>
              <h3 className="landing-step__title">{step.title}</h3>
              <p className="landing-step__desc">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FUNKCIE ─── */}
      <section className="landing-section landing-section--alt" id="features">
        <h2 className="landing-section__title">Všetko, čo potrebujete</h2>
        <p className="landing-section__subtitle">Kompletný systém pre vašu cukráreň.</p>
        <div className="landing-features">
          {[
            { icon: '🖥️', title: 'Vlastná stránka', desc: 'Krásna stránka s vašou ponukou, prístupná na vlastnom odkaze.' },
            { icon: '📱', title: 'Mobilný dizajn', desc: 'Perfektne funguje na mobile, tablete aj počítači.' },
            { icon: '📧', title: 'Email notifikácie', desc: 'Objednávky aj potvrdenia automaticky na email.' },
            { icon: '🎨', title: 'Vlastné farby & logo', desc: 'Prispôsobte si vzhľad podľa vašej značky.' },
            { icon: '📄', title: 'PDF objednávky', desc: 'Automaticky generovaný PDF súbor pre každú objednávku.' },
            { icon: '📊', title: 'Štatistiky', desc: 'Sledujte návštevnosť a obľúbené produkty.' },
          ].map((f, i) => (
            <div className="landing-feature" key={i}>
              <div className="landing-feature__icon">{f.icon}</div>
              <h3 className="landing-feature__title">{f.title}</h3>
              <p className="landing-feature__desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── DEMO UKÁŽKA ─── */}
      <section className="landing-section" id="demo">
        <h2 className="landing-section__title">Pozrite sa, ako to vyzerá</h2>
        <p className="landing-section__subtitle">Ukážka reálnej cukrárne na našej platforme.</p>
        <div className="landing-demo">
          <div className="landing-demo__browser">
            <div className="landing-demo__browser-bar">
              <span /><span /><span />
              <div className="landing-demo__browser-url">upecsitortu.sk/vasacukraren</div>
            </div>
            <div className="landing-demo__browser-body">
              <div className="landing-demo__preview">
                <h3>🎂 Cukráreň Sladký Sen</h3>
                <div className="landing-demo__products">
                  <div className="landing-demo__product">
                    <div className="landing-demo__product-emoji">🍰</div>
                    <span>Jahodová torta</span>
                    <strong>26,90 €</strong>
                  </div>
                  <div className="landing-demo__product">
                    <div className="landing-demo__product-emoji">🧁</div>
                    <span>Vanilkové cupcakes</span>
                    <strong>14,50 €</strong>
                  </div>
                  <div className="landing-demo__product">
                    <div className="landing-demo__product-emoji">🍫</div>
                    <span>Čokoládový fondán</span>
                    <strong>8,90 €</strong>
                  </div>
                </div>
                <button className="landing-demo__cta">🛒 Objednať</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CENNÍK ─── */}
      <section className="landing-section landing-section--alt" id="pricing">
        <h2 className="landing-section__title">Jednoduchý cenník</h2>
        <p className="landing-section__subtitle">Vyberte si plán, ktorý vám vyhovuje. Bez skrytých poplatkov.</p>
        <div className="landing-pricing">
          {plans.map((plan, i) => (
            <div className={`landing-plan${plan.highlighted ? ' landing-plan--highlighted' : ''}`} key={i}>
              {plan.highlighted && <div className="landing-plan__badge">Najobľúbenejší</div>}
              <h3 className="landing-plan__name">{plan.name}</h3>
              <div className="landing-plan__price">
                <span className="landing-plan__amount">{plan.price}</span>
                <span className="landing-plan__period">{plan.period}</span>
              </div>
              <ul className="landing-plan__features">
                {plan.features.map((f, j) => (
                  <li key={j}>✓ {f}</li>
                ))}
              </ul>
              <button
                className={plan.highlighted ? 'landing-btn--primary' : 'landing-btn--outline'}
                onClick={() => {
                  if (plan.action === 'register') { openRegModal(); }
                  else { alert('🚧 Pracuje sa na tom. Čoskoro dostupné!'); }
                }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="landing-section" id="faq">
        <h2 className="landing-section__title">Často kladené otázky</h2>
        <div className="landing-faq">
          {faqItems.map((item, i) => (
            <div className={`landing-faq__item${openFaq === i ? ' landing-faq__item--open' : ''}`} key={i}>
              <button className="landing-faq__question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <span>{item.q}</span>
                <span className="landing-faq__arrow">{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <div className="landing-faq__answer">{item.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <div className="landing-footer__logo">Upeč si cenu</div>
            <p>Online objednávkový systém pre cukrárne.</p>
          </div>
          <div className="landing-footer__links">
            <div>
              <h4>Produkt</h4>
              <button onClick={() => scrollTo('features')}>Funkcie</button>
              <button onClick={() => scrollTo('pricing')}>Cenník</button>
              <button onClick={() => scrollTo('faq')}>FAQ</button>
            </div>
            <div>
              <h4>Kontakt</h4>
              <a href="mailto:janspano01@gmail.com">janspano01@gmail.com</a>
            </div>
          </div>
        </div>
        <div className="landing-footer__bottom">
          © {new Date().getFullYear()} UPečSiTortu. Všetky práva vyhradené.
        </div>
      </footer>

      {/* ─── REGISTRATION MODAL ─── */}
      {showRegModal && (
        <div className="landing-modal-overlay" onClick={() => !regLoading && setShowRegModal(false)}>
          <div className="landing-modal" onClick={e => e.stopPropagation()}>
            <button className="landing-modal__close" onClick={() => setShowRegModal(false)}>✕</button>
            {regSuccess ? (
              <div className="landing-modal__success">
                <div className="landing-modal__success-icon">🎉</div>
                <h2>Registrácia úspešná!</h2>
                <p>Skontrolujte si email a potvrďte registráciu. Potom sa môžete prihlásiť do admin panelu.</p>
                {regCreatedSlug && (
                  <div className="landing-modal__created-url">
                    Vaša stránka bude na:<br />
                    <strong>{window.location.host}/{regCreatedSlug}</strong>
                  </div>
                )}
                <button className="landing-btn--primary" onClick={() => navigate('/admin')}>
                  Prejsť do admin panelu
                </button>
              </div>
            ) : (
              <>
                <h2>Vytvorte si účet</h2>
                <p>Zaregistrujte svoju cukráreň a začnite prijímať objednávky online.</p>
                {regError && <div className="landing-modal__error">{regError}</div>}
                <form onSubmit={handleRegister} className="landing-modal__form">
                  <label>
                    Názov cukrárne
                    <input
                      type="text"
                      value={regBakeryName}
                      onChange={e => handleBakeryNameChange(e.target.value)}
                      placeholder="napr. Sladký Sen"
                      required
                    />
                  </label>
                  <label>
                    Odkaz na vašu stránku
                    <div className="landing-modal__pw-wrap">
                      <input
                        type="text"
                        value={regSlug}
                        onChange={e => handleSlugChange(e.target.value)}
                        placeholder="sladky-sen"
                        required
                        minLength={2}
                        autoComplete="off"
                      />
                    </div>
                    <span className="landing-modal__slug-preview">
                      {window.location.host}/<strong>{regSlug || 'vas-odkaz'}</strong>
                    </span>
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      placeholder="vas@email.sk"
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    Heslo
                    <div className="landing-modal__pw-wrap">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        value={regPassword}
                        onChange={e => setRegPassword(e.target.value)}
                        placeholder="Minimálne 6 znakov"
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                      <button type="button" className="landing-modal__pw-toggle" onClick={() => setShowPwd(v => !v)} tabIndex={-1}>
                        {showPwd ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </label>
                  <label>
                    Potvrdiť heslo
                    <div className="landing-modal__pw-wrap">
                      <input
                        type={showPwdConfirm ? 'text' : 'password'}
                        value={regPasswordConfirm}
                        onChange={e => setRegPasswordConfirm(e.target.value)}
                        placeholder="Zadajte heslo znova"
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                      <button type="button" className="landing-modal__pw-toggle" onClick={() => setShowPwdConfirm(v => !v)} tabIndex={-1}>
                        {showPwdConfirm ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                    {regPasswordConfirm.length > 0 && regPassword !== regPasswordConfirm && (
                      <span className="landing-modal__field-error">Heslá sa nezhodujú</span>
                    )}
                  </label>
                  <button type="submit" className="landing-btn--primary" disabled={regLoading}>
                    {regLoading ? 'Registrujem…' : 'Zaregistrovať sa'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
