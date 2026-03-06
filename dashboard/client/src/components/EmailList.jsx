import React from 'react';

const STATUS_COLORS = {
  booked: { bg: '#064e3b', text: '#34d399', label: 'Booked' },
  'awaiting-info': { bg: '#451a03', text: '#fbbf24', label: 'Awaiting Info' },
  flagged: { bg: '#450a0a', text: '#f87171', label: 'Flagged' },
  error: { bg: '#450a0a', text: '#f87171', label: 'Error' },
  skipped: { bg: '#1e293b', text: '#64748b', label: 'Skipped' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.skipped;
  return (
    <span style={{ background: s.bg, color: s.text, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function ConfBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 70 ? '#34d399' : pct >= 40 ? '#fbbf24' : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '48px', height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{pct}%</span>
    </div>
  );
}

export default function EmailList({ emails, selected, onSelect, onAction }) {
  if (!emails.length) return <div style={{ color: '#64748b', textAlign: 'center', padding: '48px' }}>No emails found</div>;

  return (
    <table style={styles.table}>
      <thead>
        <tr>
          {['Time', 'Sender', 'Subject', 'Status', 'Confidence', 'Actions'].map(h => (
            <th key={h} style={styles.th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {emails.map(email => (
          <tr
            key={email.id}
            style={{ ...styles.row, ...(selected?.id === email.id ? styles.rowActive : {}) }}
            onClick={() => onSelect(email)}
          >
            <td style={styles.td}>{new Date(email.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td style={styles.td}>
              <div style={{ fontSize: '13px', color: '#e2e8f0' }}>{email.senderName || '—'}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>{email.senderEmail}</div>
            </td>
            <td style={{ ...styles.td, maxWidth: '260px' }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                {email.subject || '(no subject)'}
              </div>
            </td>
            <td style={styles.td}><StatusBadge status={email.status} /></td>
            <td style={styles.td}><ConfBar value={email.confidence} /></td>
            <td style={styles.td} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: '4px' }}>
                {email.status !== 'booked' && (
                  <button style={styles.btn} onClick={() => onAction(email.id, 'approve')}>✓</button>
                )}
                <button style={{ ...styles.btn, ...styles.btnRed }} onClick={() => {
                  const reason = prompt('Flag reason:');
                  if (reason) onAction(email.id, 'flag', { reason });
                }}>⚑</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const styles = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid #1e293b' },
  row: { borderBottom: '1px solid #1e293b', cursor: 'pointer', transition: 'background 0.1s' },
  rowActive: { background: '#1e293b' },
  td: { padding: '10px 12px', verticalAlign: 'middle', color: '#cbd5e1' },
  btn: { padding: '3px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' },
  btnRed: { borderColor: '#450a0a', color: '#f87171' },
};
