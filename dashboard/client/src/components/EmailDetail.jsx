import React, { useState } from 'react';

const STATUS_COLORS = {
  booked: '#34d399', 'awaiting-info': '#fbbf24', flagged: '#f87171', error: '#f87171', skipped: '#64748b',
};

export default function EmailDetail({ email, onClose, onAction }) {
  const [flagReason, setFlagReason] = useState('');
  const [showFlagInput, setShowFlagInput] = useState(false);

  const parsed = email.parsedData;
  const conf = Math.round((email.confidence || 0) * 100);
  const statusColor = STATUS_COLORS[email.status] || '#64748b';

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <div style={styles.subject}>{email.subject || '(no subject)'}</div>
          <div style={styles.meta}>{email.senderName} &lt;{email.senderEmail}&gt;</div>
        </div>
        <button onClick={onClose} style={styles.close}>✕</button>
      </div>

      <div style={styles.statusRow}>
        <span style={{ ...styles.badge, color: statusColor, background: statusColor + '22' }}>{email.status}</span>
        <span style={styles.conf}>Confidence: <strong style={{ color: conf >= 70 ? '#34d399' : conf >= 40 ? '#fbbf24' : '#f87171' }}>{conf}%</strong></span>
        {email.jobId && <span style={styles.jobId}>Job #{email.jobNumber || email.jobId}</span>}
      </div>

      {email.flagReason && (
        <div style={styles.flagBox}>⚑ {email.flagReason}</div>
      )}

      {parsed && (
        <Section title="Parsed Fields">
          {Object.entries(parsed).filter(([k]) => k !== 'missing' && k !== 'replyMessage').map(([k, v]) => (
            <div key={k} style={styles.field}>
              <span style={styles.fieldKey}>{k}</span>
              <span style={styles.fieldVal}>{typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}</span>
            </div>
          ))}
          {parsed.missing?.length > 0 && (
            <div style={styles.missingBox}>Missing: {parsed.missing.join(', ')}</div>
          )}
        </Section>
      )}

      {email.draftReply && (
        <Section title="Draft Reply">
          <pre style={styles.pre}>{email.draftReply}</pre>
        </Section>
      )}

      <Section title="Raw Email (first 500 chars)">
        <pre style={styles.pre}>{email.body || '(empty)'}</pre>
      </Section>

      {email.reviewedAt && (
        <div style={styles.reviewed}>Reviewed by {email.reviewedBy || 'unknown'} at {new Date(email.reviewedAt).toLocaleString()}</div>
      )}

      <div style={styles.actions}>
        <button style={styles.approveBtn} onClick={() => onAction(email.id, 'approve')}>✓ Approve</button>
        <button style={styles.rejectBtn} onClick={() => onAction(email.id, 'reject', { reason: 'Rejected by reviewer' })}>✕ Reject</button>
        {showFlagInput ? (
          <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
            <input
              style={styles.input}
              placeholder="Flag reason..."
              value={flagReason}
              onChange={e => setFlagReason(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && flagReason) { onAction(email.id, 'flag', { reason: flagReason }); setShowFlagInput(false); setFlagReason(''); } }}
            />
            <button style={styles.flagBtn} onClick={() => { if (flagReason) { onAction(email.id, 'flag', { reason: flagReason }); setShowFlagInput(false); setFlagReason(''); } }}>Flag</button>
          </div>
        ) : (
          <button style={styles.flagBtn} onClick={() => setShowFlagInput(true)}>⚑ Flag</button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: '1px solid #1e293b' }}>
      <button style={sectionStyles.toggle} onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'} {title}</button>
      {open && <div style={sectionStyles.body}>{children}</div>}
    </div>
  );
}

const sectionStyles = {
  toggle: { width: '100%', background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textAlign: 'left', padding: '10px 16px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' },
  body: { padding: '0 16px 12px' },
};

const styles = {
  panel: { padding: '0', display: 'flex', flexDirection: 'column', height: '100%' },
  header: { padding: '16px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' },
  subject: { fontSize: '15px', fontWeight: 600, color: '#f1f5f9', marginBottom: '4px' },
  meta: { fontSize: '12px', color: '#64748b' },
  close: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px', padding: '4px' },
  statusRow: { padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #1e293b' },
  badge: { padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 },
  conf: { color: '#64748b', fontSize: '13px' },
  jobId: { color: '#818cf8', fontSize: '13px', fontWeight: 600 },
  flagBox: { margin: '10px 16px', padding: '8px 12px', background: '#450a0a', borderRadius: '6px', color: '#f87171', fontSize: '13px' },
  field: { display: 'flex', gap: '8px', marginBottom: '4px', fontSize: '13px' },
  fieldKey: { color: '#64748b', minWidth: '140px', flexShrink: 0 },
  fieldVal: { color: '#e2e8f0', wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
  missingBox: { background: '#451a03', padding: '6px 10px', borderRadius: '4px', color: '#fbbf24', fontSize: '12px', marginTop: '8px' },
  pre: { background: '#0f172a', borderRadius: '6px', padding: '10px', fontSize: '12px', color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflow: 'auto' },
  reviewed: { padding: '8px 16px', fontSize: '11px', color: '#475569', borderTop: '1px solid #1e293b' },
  actions: { padding: '12px 16px', display: 'flex', gap: '8px', borderTop: '1px solid #1e293b', marginTop: 'auto', flexWrap: 'wrap' },
  approveBtn: { padding: '7px 14px', background: '#064e3b', border: '1px solid #059669', borderRadius: '6px', color: '#34d399', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  rejectBtn: { padding: '7px 14px', background: '#450a0a', border: '1px solid #dc2626', borderRadius: '6px', color: '#f87171', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  flagBtn: { padding: '7px 14px', background: '#451a03', border: '1px solid #d97706', borderRadius: '6px', color: '#fbbf24', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  input: { flex: 1, padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' },
};
