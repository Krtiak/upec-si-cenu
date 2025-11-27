import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
        alert('Registrácia úspešná! Teraz sa prihláste.');
        setIsSignUp(false);
      } else {
        await signIn(email, password);
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba pri autentifikácii');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{isSignUp ? 'Registrácia' : 'Prihlásenie'}</h1>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Heslo"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Čakám...' : isSignUp ? 'Zaregistruj sa' : 'Prihláste sa'}
          </button>
        </form>
        <p style={styles.toggle}>
          {isSignUp ? 'Máte účet? ' : 'Nemáte účet? '}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            style={styles.toggleButton}
          >
            {isSignUp ? 'Prihláste sa' : 'Zaregistrujte sa'}
          </button>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '1rem',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '450px',
  } as React.CSSProperties,
  title: {
    marginBottom: '1.5rem',
    textAlign: 'center' as const,
    color: '#333',
    fontSize: '1.75rem',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  } as React.CSSProperties,
  input: {
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem',
    width: '100%',
  } as React.CSSProperties,
  button: {
    padding: '0.75rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: 'bold',
  } as React.CSSProperties,
  error: {
    color: '#dc3545',
    fontSize: '0.875rem',
    margin: '0.5rem 0',
  } as React.CSSProperties,
  toggle: {
    textAlign: 'center' as const,
    marginTop: '1rem',
    fontSize: '0.875rem',
  } as React.CSSProperties,
  toggleButton: {
    background: 'none',
    border: 'none',
    color: '#007bff',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: 'inherit',
  } as React.CSSProperties,
};
