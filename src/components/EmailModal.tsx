import React, { useState } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, email: string) => void;
};

export function EmailModal({ isOpen, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  if (!isOpen) return null;

  const valid = /.+@.+\..+/.test(email);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>Dokončiť objednávku</h3>
        <div style={styles.fieldRow}>
          <label style={styles.label}>Meno</label>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Meno a priezvisko" />
        </div>
        <div style={styles.fieldRow}>
          <label style={styles.label}>E‑mail</label>
          <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@domena.sk" />
        </div>
        <div style={styles.actions}>
          <button style={styles.cancel} onClick={onClose}>Zrušiť</button>
          <button style={{ ...styles.submit, ...(valid ? {} : styles.submitDisabled) }} disabled={!valid} onClick={() => onSubmit(name.trim(), email.trim())}>Uložiť objednávku</button>
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
    color: '#64748b',
    letterSpacing: '0.02em',
  } as React.CSSProperties,
  input: {
    border: '1px solid #e6e6e9',
    borderRadius: '8px',
    padding: '0.6rem 0.75rem',
    fontSize: '0.95rem',
    outline: 'none',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
    marginTop: '0.5rem',
  } as React.CSSProperties,
  cancel: {
    background: '#f1f5f9',
    border: '1px solid #e2e8f0',
    color: '#475569',
    borderRadius: '8px',
    padding: '0.6rem 0.9rem',
    cursor: 'pointer',
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
  submitDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

export default EmailModal;