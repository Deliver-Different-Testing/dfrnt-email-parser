import React from 'react';

export default function StatBar({ stats }) {
  if (!stats) return <div style={styles.bar}><span style={styles.loading}>Loading stats...</span></div>;

  const { today = {}, total = {} } = stats;
  const totalAll = Object.values(total).reduce((a, b) => a + b, 0);
  const todayAll = Object.values(today).reduce((a, b) => a + b, 0);

  const cards = [
    { label: 'Today', value: todayAll, color: '#60a5fa' },
    { label: 'Booked', value: total.booked || 0, todayVal: today.booked || 0, color: '#34d399' },
    { label: 'Awaiting Info', value: total['awaiting-info'] || 0, todayVal: today['awaiting-info'] || 0, color: '#fbbf24' },
    { label: 'Flagged', value: total.flagged || 0, todayVal: today.flagged || 0, color: '#f87171' },
    { label: 'Skipped', value: total.skipped || 0, todayVal: today.skipped || 0, color: '#64748b' },
    { label: 'Total All Time', value: totalAll, color: '#818cf8' },
  ];

  return (
    <div style={styles.bar}>
      {cards.map(c => (
        <div key={c.label} style={styles.card}>
          <div style={{ ...styles.value, color: c.color }}>{c.value}</div>
          <div style={styles.label}>{c.label}</div>
          {c.todayVal !== undefined && <div style={styles.sub}>+{c.todayVal} today</div>}
        </div>
      ))}
    </div>
  );
}

const styles = {
  bar: { display: 'flex', gap: '12px', padding: '16px 24px', background: '#0f172a', borderBottom: '1px solid #1e293b', flexWrap: 'wrap' },
  card: { background: '#1e293b', borderRadius: '8px', padding: '12px 20px', minWidth: '120px', flex: '1' },
  value: { fontSize: '28px', fontWeight: 700, lineHeight: 1 },
  label: { color: '#94a3b8', fontSize: '12px', marginTop: '4px' },
  sub: { color: '#475569', fontSize: '11px', marginTop: '2px' },
  loading: { color: '#64748b', fontSize: '14px' },
};
