import { useNavigate } from 'react-router-dom';

export function TermsPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#f9f9fb', fontFamily: 'system-ui, Arial, sans-serif', color: '#1a1a2e' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px', padding: 0 }}
        >
          ← Späť
        </button>
        <span style={{ color: '#e5e7eb' }}>|</span>
        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#4f46e5' }}>Upeč si cenu</span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 2rem 5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Obchodné podmienky</h1>
        <p style={{ color: '#6b7280', marginBottom: '2.5rem', fontSize: '0.95rem' }}>
          Platné od: 1. marca 2026 &nbsp;·&nbsp; Prevádzkovateľ: Ján Špaňo (Upeč si cenu)
        </p>

        <Section title="1. Všeobecné ustanovenia">
          <p>
            Tieto obchodné podmienky (ďalej len „Podmienky") upravujú vzťah medzi prevádzkovateľom
            platformy <strong>Upeč si cenu</strong> (ďalej len „Platforma") a registrovanými používateľmi –
            cukrárňami (ďalej len „Používateľ").
          </p>
          <p>
            Registráciou na Platforme Používateľ potvrdzuje, že si tieto Podmienky prečítal, porozumel im
            a súhlasí s nimi v plnom rozsahu.
          </p>
        </Section>

        <Section title="2. Popis služby">
          <p>
            Platforma poskytuje Používateľom nástroje na:
          </p>
          <ul>
            <li>vytvorenie vlastnej verejnej stránky s ponukou produktov,</li>
            <li>príjem a správu objednávok od zákazníkov,</li>
            <li>odosielanie e-mailových notifikácií o objednávkach,</li>
            <li>základnú štatistiku návštevnosti,</li>
            <li>prispôsobenie dizajnu stránky (farby, téma).</li>
          </ul>
          <p>
            Platforma funguje ako technický nástroj – prevádzkovateľ nie je zmluvnou stranou pri
            objednávkach medzi Používateľom a jeho zákazníkmi.
          </p>
        </Section>

        <Section title="3. Registrácia a účet">
          <p>
            Na používanie Platformy je potrebná registrácia s platnými údajmi (e-mail, názov cukrárne,
            URL odkaz). Používateľ zodpovedá za bezpečnosť svojho hesla a za všetky aktivity
            vykonané pod jeho účtom.
          </p>
          <p>
            Prevádzkovateľ si vyhradzuje právo zrušiť alebo pozastaviť účet, ktorý porušuje tieto
            Podmienky, bez predchádzajúceho upozornenia.
          </p>
        </Section>

        <Section title="4. Povinnosti Používateľa">
          <p>Používateľ sa zaväzuje:</p>
          <ul>
            <li>uvádzať pravdivé a aktuálne informácie o svojich produktoch a cenách,</li>
            <li>splniť všetky zákonné povinnosti vyplývajúce z predaja tovaru (napr. informačné povinnosti voči spotrebiteľom, GDPR, daňové predpisy),</li>
            <li>nepoužívať Platformu na šírenie nelegálneho, zavádzajúceho alebo škodlivého obsahu,</li>
            <li>neporušovať autorské práva ani práva tretích strán.</li>
          </ul>
        </Section>

        <Section title="5. Ceny a platby">
          <p>
            Platforma ponúka bezplatný skúšobný plán (Trial) a platené plány (Pro, Custom).
            Ceny platených plánov sú uvedené na stránke v sekcii Cenník a môžu byť zmenené
            s upozornením minimálne 30 dní vopred.
          </p>
          <p>
            Bezplatný plán nevyžaduje kreditnú kartu a môže byť kedykoľvek bez podmienok ukončený.
          </p>
        </Section>

        <Section title="6. Ochrana osobných údajov (GDPR)">
          <p>
            Prevádzkovateľ spracúva osobné údaje Používateľov (e-mail, IP adresa v anonymizovanej
            podobe) v súlade s nariadením GDPR (EÚ) 2016/679.
          </p>
          <p>
            Používateľ ako prevádzkovateľ vlastnej stránky nesie zodpovednosť za to, aby spracúvanie
            osobných údajov jeho zákazníkov (meno, e-mail pri objednávke) bolo v súlade s GDPR,
            vrátane zverejnenia vlastnej Zásady ochrany osobných údajov.
          </p>
          <p>
            Prevádzkovateľ Platformy osobné údaje zákazníkov cukrární nepredáva tretím stranám
            a ukladá ich len na účel spracovania objednávok a prevádzky Platformy.
          </p>
        </Section>

        <Section title="7. Vylúčenie zodpovednosti">
          <p>
            Platforma je poskytovaná „tak ako je" (as-is). Prevádzkovateľ nezaručuje nepretržitú
            dostupnosť služby a nenesie zodpovednosť za:
          </p>
          <ul>
            <li>stratu dát spôsobenú technickou poruchou,</li>
            <li>škody vzniknuté Používateľovi alebo jeho zákazníkom v dôsledku výpadku služby,</li>
            <li>obsah zverejnený Používateľmi na ich stránkach.</li>
          </ul>
        </Section>

        <Section title="8. Duševné vlastníctvo">
          <p>
            Všetok obsah Platformy (dizajn, kód, texty, logá) je duševným vlastníctvom prevádzkovateľa
            alebo je použitý na základe licencií. Používateľ nemá právo kopírovať ani
            ďalej distribuovať obsah Platformy bez písomného súhlasu.
          </p>
          <p>
            Obsahom zverejneným Používateľom na jeho stránke zostáva vlastníkom Používateľ.
            Prevádzkovateľ má právo tento obsah zobraziť na Platforme v rozsahu potrebnom na
            poskytnutie služby.
          </p>
        </Section>

        <Section title="9. Ukončenie služby">
          <p>
            Používateľ môže kedykoľvek požiadať o zrušenie svojho účtu zaslaním e-mailu na
            <a href="mailto:janspano01@gmail.com" style={{ color: '#4f46e5' }}> janspano01@gmail.com</a>.
            Po zrušení účtu budú všetky jeho dáta vymazané do 30 dní.
          </p>
        </Section>

        <Section title="10. Zmeny podmienok">
          <p>
            Prevádzkovateľ si vyhradzuje právo tieto Podmienky kedykoľvek zmeniť.
            O zmenách bude Používateľ informovaný e-mailom najmenej 14 dní pred nadobudnutím
            účinnosti. Ďalšie používanie Platformy po nadobudnutí účinnosti zmien sa považuje za
            súhlas s novými Podmienkami.
          </p>
        </Section>

        <Section title="11. Rozhodné právo">
          <p>
            Tieto Podmienky sa riadia právnym poriadkom Slovenskej republiky.
            Všetky spory budú riešené pred príslušnými súdmi Slovenskej republiky.
          </p>
        </Section>

        <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb', color: '#9ca3af', fontSize: '0.9rem' }}>
          V prípade otázok nás kontaktujte na{' '}
          <a href="mailto:janspano01@gmail.com" style={{ color: '#4f46e5' }}>janspano01@gmail.com</a>.
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem', color: '#1a1a2e' }}>{title}</h2>
      <div style={{ lineHeight: 1.7, color: '#374151', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {children}
      </div>
    </div>
  );
}
