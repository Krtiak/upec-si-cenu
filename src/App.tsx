import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AdminPanel } from './pages/AdminPanel';
import { LandingPage } from './pages/LandingPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page — hlavná stránka projektu */}
        <Route path="/" element={<LandingPage />} />
        {/* Verejná homepage každej cukrárne podľa slug */}
        <Route path="/:slug" element={<HomePage />} />
        {/* Zdieľaný admin panel — po prihlásení vidí každý svoje dáta */}
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App
