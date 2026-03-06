import React, { useState, useEffect, useCallback } from 'react';
import StatBar from './components/StatBar.jsx';
import EmailList from './components/EmailList.jsx';
import EmailDetail from './components/EmailDetail.jsx';

const TABS = [
  { label: 'All', value: 'all' },
  { label: 'Booked', value: 'booked' },
  { label: 'Awaiting Info', value: 'awaiting-info' },
  { label: 'Flagged', value: 'flagged' },
  { label: 'Errors', value: 'error' },
  { label: 'Skipped', value: 'skipped' },
];

const API = '/api';

export default function App() {
  const [stats, setStats] = useState(null);
  const [emails, setEmails] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchStats = useCallback(async () => {
    const res = await fetch(`${API}/stats`);
    const data = await res.json();
    setStats(data);
  }, []);

  const fetchEmails = useCallback(async (currentTab, currentPage) => {
    setLoading(true);
    const status = currentTab === 'all' ? '' : currentTab;
    const res = await fetch(`${API}/emails?status=${status}&page=${currentPage}&limit=50`);
    const data = await res.json();
    setEmails(data.data || []);
    setTotal(data.total || 0);
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  const refresh = useCallback(() => {
    fetchStats();
    fetchEmails(tab, page);
    if (selected) {
      fetch(`${API}/emails/${selected.id}`).then(r => r.json()).then(setSelected);
    }
  }, [tab, page, selected, fetchStats, fetchEmails]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    setPage(1);
    fetchEmails(tab, 1);
    fetchStats();
  }, [tab]);

  const handleAction = async (emailId, action, body = {}) => {
    await fetch(`${API}/emails/${emailId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    refresh();
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>📬 DFRNT Email Parser</h1>
        <span style={styles.refresh}>
          {lastRefresh ? `Last updated ${lastRefresh.toLocaleTimeString()}` : 'Loading...'}
        </span>
      </header>

      <StatBar stats={stats} />

      <div style={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.value}
            style={{ ...styles.tab, ...(tab === t.value ? styles.tabActive : {}) }}
            onClick={() => setTab(t.value)}
          >
            {t.label}
            {stats && (
              <span style={styles.tabCount}>
                {t.value === 'all'
                  ? Object.values(stats.total || {}).reduce((a, b) => a + b, 0)
                  : (stats.total?.[t.value] || 0)}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={styles.body}>
        <div style={styles.listPane}>
          {loading && <div style={styles.loading}>Loading...</div>}
          <EmailList
            emails={emails}
            selected={selected}
            onSelect={setSelected}
            onAction={handleAction}
          />
          {total > 50 && (
            <div style={styles.pagination}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={styles.pgBtn}>← Prev</button>
              <span style={{ color: '#94a3b8' }}>Page {page} of {Math.ceil(total / 50)}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)} style={styles.pgBtn}>Next →</button>
            </div>
          )}
        </div>

        {selected && (
          <div style={styles.detailPane}>
            <EmailDetail
              email={selected}
              onClose={() => setSelected(null)}
              onAction={handleAction}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  app: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { padding: '16px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a' },
  title: { fontSize: '20px', fontWeight: 700, color: '#f1f5f9' },
  refresh: { fontSize: '12px', color: '#64748b' },
  tabs: { display: 'flex', gap: '4px', padding: '12px 24px', borderBottom: '1px solid #1e293b', background: '#0f172a' },
  tab: { padding: '6px 14px', background: 'transparent', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' },
  tabActive: { background: '#1e40af', borderColor: '#1e40af', color: '#fff' },
  tabCount: { background: '#334155', borderRadius: '10px', padding: '1px 7px', fontSize: '11px' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  listPane: { flex: 1, overflow: 'auto', padding: '16px 24px' },
  detailPane: { width: '480px', borderLeft: '1px solid #1e293b', overflow: 'auto', background: '#0f172a' },
  loading: { color: '#64748b', padding: '16px', textAlign: 'center' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '16px' },
  pgBtn: { padding: '6px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer' },
};
