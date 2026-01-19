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
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const valid = /.+@.+\..+/.test(email);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button aria-label="Close" style={styles.closeBtn} onClick={onClose}>✕</button>
        <h3 style={styles.title}>Dokončiť objednávku</h3>
        <div style={styles.fieldRow}>
          <label style={styles.label}>Meno</label>
          <input
            ref={nameRef}
            style={{ ...styles.input, ...(showInvalid && !name.trim() ? styles.invalidInput : {}) }}
            value={name}
            onChange={(e) => { setName(e.target.value); setShowInvalid(false); }}
            placeholder="Meno a priezvisko"
            aria-invalid={showInvalid && !name.trim()}
          />
        </div>
        <div style={styles.fieldRow}>
          <label style={styles.label}>E‑mail</label>
          <input
            ref={emailRef}
            style={{ ...styles.input, ...(showInvalid && !valid ? styles.invalidInput : {}) }}
            value={email}
            onChange={(e) => { setEmail(e.target.value); setShowInvalid(false); }}
            placeholder="email@domena.sk"
            aria-invalid={showInvalid && !valid}
          />
        </div>
        <div style={styles.actions}>
          <button
            style={styles.submit}
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
          >Objednať</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  } as React.CSSProperties,
  modal: {
    width: 'min(90vw, 440px)',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
    padding: '1rem',
    position: 'relative' as const,
  } as React.CSSProperties,
  title: {
    margin: '0 0 0.75rem 0',
    color: '#ffa9a9ff',
    fontSize: '1.25rem',
  } as React.CSSProperties,
  fieldRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    marginBottom: '0.75rem',
  } as React.CSSProperties,
  label: {
    fontSize: '0.85rem',
    color: '#000000',
    fontWeight: 600,
    letterSpacing: '0.02em',
  } as React.CSSProperties,
  input: {
    border: '1px solid #dbeafe',
    background: '#ffffff',
    color: '#000000',
    borderRadius: '8px',
    padding: '0.6rem 0.75rem',
    fontSize: '0.95rem',
    outline: 'none',
    fontWeight: 600,
  } as React.CSSProperties,
  invalidInput: {
    border: '2px solid #ff6b6b',
    background: '#fff5f5',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
    marginTop: '0.5rem',
  } as React.CSSProperties,
  cancel: {
    display: 'none',
  } as React.CSSProperties,
  submit: {
    background: '#5b8fd9',
    border: '1px solid #4e7ec2',
    color: '#fff',
    borderRadius: '8px',
    padding: '0.6rem 0.9rem',
    cursor: 'pointer',
    fontWeight: 600,
  } as React.CSSProperties,
  closeBtn: {
    position: 'absolute' as const,
    top: 16,
    right: 16,
    background: '#6fa8ff',
    border: '1px solid #4a7dc9',
    color: '#1f1f1f',
    borderRadius: 8,
    cursor: 'pointer',
    padding: '0.3rem 0.6rem',
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
  } as React.CSSProperties,
};

export default EmailModal;