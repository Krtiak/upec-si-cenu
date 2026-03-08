import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Bakery {
  id: string;
  slug: string;
  name: string;
  email: string;
  logo_url: string | null;
  theme: string;
  is_active: boolean;
  plan: string;
  created_at: string;
}

interface BakeryStats {
  bakeryId: string;
  totalVisits: number;
  visits24h: number;
  totalOrders: number;
  memberCount: number;
}

interface Props {
  user: any;
  onLogout: () => void;
}

export function SuperAdminPanel({ user, onLogout }: Props) {
  const [bakeries, setBakeries] = useState<Bakery[]>([]);
  const [stats, setStats] = useState<Record<string, BakeryStats>>({});
  const [loading, setLoading] = useState(true);
  const [selectedBakery, setSelectedBakery] = useState<Bakery | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load all bakeries
      const { data: baks, error } = await supabase
        .from('bakeries')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setBakeries(baks || []);

      // Load stats for each bakery
      const statsMap: Record<string, BakeryStats> = {};
      for (const b of baks || []) {
        const [visits, visits24h, orders, members] = await Promise.all([
          supabase.from('page_visits').select('*', { count: 'exact', head: true }).eq('bakery_id', b.id),
          supabase.from('page_visits').select('*', { count: 'exact', head: true }).eq('bakery_id', b.id).gte('created_at', new Date(Date.now() - 86400000).toISOString()),
          supabase.from('orders').select('*', { count: 'exact', head: true }),
          supabase.from('bakery_members').select('*', { count: 'exact', head: true }).eq('bakery_id', b.id),
        ]);
        statsMap[b.id] = {
          bakeryId: b.id,
          totalVisits: visits.count ?? 0,
          visits24h: visits24h.count ?? 0,
          totalOrders: orders.count ?? 0,
          memberCount: members.count ?? 0,
        };
      }
      setStats(statsMap);
    } catch (err) {
      console.error('SuperAdmin loadData failed:', err);
    } finally {
      setLoading(false);
    }
  }

  const totalBakeries = bakeries.length;
  const activeBakeries = bakeries.filter(b => b.is_active).length;
  const totalVisitsAll = Object.values(stats).reduce((s, v) => s + v.totalVisits, 0);
  const totalOrdersAll = Object.values(stats).reduce((s, v) => s + v.totalOrders, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Načítavam dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <h1 className="text-xl font-bold bg-linear-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
              Super Admin
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:inline">{user?.email}</span>
            <button
              onClick={onLogout}
              className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
            >
              Odhlásiť
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon="🏪"
            label="Cukrárne"
            value={totalBakeries}
            sub={`${activeBakeries} aktívnych`}
            color="violet"
          />
          <StatCard
            icon="👁️"
            label="Návštevy celkovo"
            value={totalVisitsAll}
            color="blue"
          />
          <StatCard
            icon="📦"
            label="Objednávky"
            value={totalOrdersAll}
            color="emerald"
          />
          <StatCard
            icon="💰"
            label="Plán"
            value={`${bakeries.filter(b => b.plan === 'pro').length} Pro`}
            sub={`${bakeries.filter(b => b.plan === 'free').length} Free`}
            color="amber"
          />
        </div>

        {/* Bakeries Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🏪</span>
              <h2 className="text-lg font-bold text-gray-900">Zoznam cukrární</h2>
            </div>
            <button
              onClick={loadData}
              className="px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors"
            >
              ↻ Obnoviť
            </button>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-sm font-medium text-gray-500">
                  <th className="px-6 py-3">Cukráreň</th>
                  <th className="px-6 py-3">URL</th>
                  <th className="px-6 py-3">Plán</th>
                  <th className="px-6 py-3">Stav</th>
                  <th className="px-6 py-3 text-right">Návštevy</th>
                  <th className="px-6 py-3 text-right">24h</th>
                  <th className="px-6 py-3 text-right">Objednávky</th>
                  <th className="px-6 py-3 text-right">Členovia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bakeries.map(b => {
                  const s = stats[b.id];
                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-violet-50/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedBakery(selectedBakery?.id === b.id ? null : b)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                            {b.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{b.name}</div>
                            <div className="text-xs text-gray-400">{b.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded text-violet-700">/{b.slug}</code>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${b.plan === 'pro' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                          {b.plan === 'pro' ? '⭐ Pro' : 'Free'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-sm ${b.is_active ? 'text-emerald-600' : 'text-red-500'}`}>
                          <span className={`w-2 h-2 rounded-full ${b.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          {b.is_active ? 'Aktívna' : 'Neaktívna'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900">{s?.totalVisits ?? 0}</td>
                      <td className="px-6 py-4 text-right text-gray-600">{s?.visits24h ?? 0}</td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900">{s?.totalOrders ?? 0}</td>
                      <td className="px-6 py-4 text-right text-gray-600">{s?.memberCount ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {bakeries.map(b => {
              const s = stats[b.id];
              return (
                <div
                  key={b.id}
                  className="p-4 hover:bg-violet-50/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedBakery(selectedBakery?.id === b.id ? null : b)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{b.name}</div>
                      <div className="text-xs text-gray-400 truncate">{b.email}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs ${b.is_active ? 'text-emerald-600' : 'text-red-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${b.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                      {b.is_active ? 'Aktívna' : 'Neaktívna'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-gray-900">{s?.totalVisits ?? 0}</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">Návštevy</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-gray-900">{s?.visits24h ?? 0}</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">24h</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-gray-900">{s?.totalOrders ?? 0}</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">Objednávky</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel for selected bakery */}
        {selectedBakery && (
          <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in">
            <div className="px-6 py-5 border-b border-gray-100 bg-linear-to-r from-violet-50 to-purple-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                  {selectedBakery.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{selectedBakery.name}</h3>
                  <p className="text-sm text-gray-500">{selectedBakery.email}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBakery(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <DetailItem label="URL adresa" value={`${window.location.origin}/${selectedBakery.slug}`} />
                <DetailItem label="Slug" value={`/${selectedBakery.slug}`} />
                <DetailItem label="Téma" value={selectedBakery.theme} />
                <DetailItem label="Plán" value={selectedBakery.plan === 'pro' ? '⭐ Pro' : 'Free'} />
                <DetailItem label="Stav" value={selectedBakery.is_active ? '✅ Aktívna' : '❌ Neaktívna'} />
                <DetailItem label="Vytvorená" value={new Date(selectedBakery.created_at).toLocaleDateString('sk')} />
                <DetailItem label="Návštevy celkovo" value={String(stats[selectedBakery.id]?.totalVisits ?? 0)} />
                <DetailItem label="Členovia" value={String(stats[selectedBakery.id]?.memberCount ?? 0)} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color: string }) {
  const colorMap: Record<string, string> = {
    violet: 'from-violet-500 to-purple-600',
    blue: 'from-blue-500 to-cyan-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className={`w-8 h-8 rounded-lg bg-linear-to-br ${colorMap[color]} opacity-20`} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm font-semibold text-gray-900 break-all">{value}</div>
    </div>
  );
}
