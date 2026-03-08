const fs = require('fs');
const path = 'c:/Users/janik/Desktop/vscode/upec si cenu/src/pages/HomePage.tsx';
let src = fs.readFileSync(path, 'utf8');

// Find exact boundaries
const startMarker = '      {/* Cart Sidebar */}';
const startIdx = src.indexOf(startMarker);
const searchFrom = startIdx + startMarker.length;
const endMarker = '        </>\n      )}';
const endIdx = src.indexOf(endMarker, searchFrom) + endMarker.length;

console.log('start:', startIdx, 'end:', endIdx);
console.log('snippet after:', JSON.stringify(src.slice(endIdx, endIdx + 60)));

const newCart = `      {/* Cart Sidebar */}
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
                        border: activeItemId === item.id ? '2px solid #e0457b' : '2px solid #ede8ed',
                        background: activeItemId === item.id ? '#fff5f9' : '#fafafa',
                        overflow: 'hidden',
                        transition: 'border-color 0.2s, background 0.2s',
                        boxShadow: activeItemId === item.id ? '0 2px 12px rgba(224,69,123,0.10)' : '0 1px 3px rgba(0,0,0,0.04)',
                      }}
                    >
                      {/* Cake title bar */}
                      <div style={{ padding: '0.5rem 0.85rem', borderBottom: '1px solid', borderBottomColor: activeItemId === item.id ? '#ffd6e7' : '#ede8ed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: activeItemId === item.id ? '#fff0f5' : '#f5f0f5' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: activeItemId === item.id ? '#e0457b' : '#b09ab0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Torta #{cartIdx + 1}
                        </span>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: activeItemId === item.id ? '#e0457b' : '#7a5f7a' }}>
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
                              <div key={\`\${item.id}-\${secKey}\`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.4rem', borderRadius: '8px', marginTop: '0.1rem' }}
                                onMouseEnter={e => (e.currentTarget.style.background = activeItemId === item.id ? '#ffe8f1' : '#f0eaf0')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#c090b0', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{label}</div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#2a1a2a', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                                  {!dsec?.hidePrice && price > 0 && (
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e0457b', background: '#fff0f5', border: '1px solid #ffd6e7', borderRadius: '20px', padding: '0.1rem 0.45rem', whiteSpace: 'nowrap' }}>
                                      {price.toFixed(2)} €
                                    </span>
                                  )}
                                  <button
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d0b0c0', lineHeight: 1, transition: 'color 0.15s, background 0.15s' }}
                                    onMouseEnter={e => { const b = e.currentTarget; b.style.color = '#fff'; b.style.background = '#e0457b'; }}
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
                          const newItem: CartItem = { id: Date.now().toString(), dynamicSelections: {}, reward: 0, totalPrice: 0, quantity: 1, eventName: \`Torta #\${cart.length + 1}\` };
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
      )}`;

if (startIdx === -1 || endIdx < endMarker.length) {
  console.error('Could not find markers! start:', startIdx, 'end:', endIdx);
  process.exit(1);
}

const result = src.slice(0, startIdx) + newCart + src.slice(endIdx);
fs.writeFileSync(path, result, 'utf8');
console.log('Done. New file length:', result.length);
