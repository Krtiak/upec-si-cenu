import React, { useState, useRef } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, email: string) => void;
};

export function EmailModal({ isOpen, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [showInvalid, setShowInvalid] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const valid = /.+@.+\..+/.test(email);

  const inputStyle = (focused: boolean, invalid: boolean): React.CSSProperties => ({
    border: invalid
      ? '2px solid #ff6b6b'
      : focused
        ? '2px solid var(--color-primary)'
        : '1.5px solid var(--color-primary-border)',
    background: invalid ? '#fff5f5' : focused ? 'var(--color-primary-bg)' : '#fff',
    color: '#1a1a1a',
    borderRadius: '10px',
    padding: '0.65rem 0.85rem',
    fontSize: '0.95rem',
    outline: 'none',
    fontWeight: 500,
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, background 0.15s',
    fontFamily: 'inherit',
  });

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Colored top accent bar */}
        <div style={styles.topBar} />

        {/* Close button */}
        <button aria-label="Close" style={styles.closeBtn} onClick={onClose}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary-bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <h3 style={styles.title}>Dokončiť objednávku</h3>

        <div style={styles.fieldRow}>
          <label style={styles.label}>Meno</label>
          <input
            ref={nameRef}
            style={inputStyle(nameFocused, showInvalid && !name.trim())}
            value={name}
            onChange={(e) => { setName(e.target.value); setShowInvalid(false); }}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            placeholder="Meno a priezvisko"
            aria-invalid={showInvalid && !name.trim()}
          />
        </div>
        <div style={styles.fieldRow}>
          <label style={styles.label}>E‑mail</label>
          <input
            ref={emailRef}
            style={inputStyle(emailFocused, showInvalid && !valid)}
            value={email}
            onChange={(e) => { setEmail(e.target.value); setShowInvalid(false); }}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder="email@domena.sk"
            aria-invalid={showInvalid && !valid}
          />
        </div>
        <div style={styles.actions}>
          <button
            style={styles.submit}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            onClick={() => {
              const nameOk = name.trim().length > 0;
              const emailOk = /.+@.+\..+/.test(email);
              if (!nameOk || !emailOk) {
                setShowInvalid(true);
                if (!nameOk) { nameRef.current?.focus(); } else { emailRef.current?.focus(); }
                return;
              }
              setShowInvalid(false);
              onSubmit(name.trim(), email.trim());
            }}
          >
            Objednať
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    width: 'min(90vw, 440px)',
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
    padding: '1.5rem 1.5rem 1.25rem',
    position: 'relative',
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))',
  },
  title: {
    margin: '0.25rem 0 1.1rem 0',
    color: 'var(--color-primary)',
    fontSize: '1.5rem',
    fontFamily: "'Dancing Script', cursive",
    fontWeight: 700,
    letterSpacing: '0.01em',
  },
  fieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    marginBottom: '0.9rem',
  },
  label: {
    fontSize: '0.8rem',
    color: 'var(--color-primary)',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '0.75rem',
  },
  submit: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
    border: 'none',
    color: '#fff',
    borderRadius: '10px',
    padding: '0.65rem 1.5rem',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '0.95rem',
    boxShadow: '0 3px 12px color-mix(in srgb, var(--color-primary) 35%, transparent)',
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    background: 'var(--color-primary-bg)',
    border: 'none',
    color: 'var(--color-primary)',
    borderRadius: '50%',
    cursor: 'pointer',
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, color 0.15s',
  },
};

export default EmailModal;
