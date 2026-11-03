import { useState, useEffect, useCallback } from 'react';
const api = async (p, o = {}) => {
  const r = await fetch('/api' + p, { ...o, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.token }, body: o.body && JSON.stringify(o.body) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d; };
const post = (p, body, method = 'POST') => api(p, { method, body });
function useLoad(p) { const [d, s] = useState([]); const l = useCallback(() => api(p).then(s).catch(() => {}), [p]); useEffect(() => { l(); }, [l]); return [d, l]; }

function Form({ fields, onSubmit, btn }) {
  const [v, s] = useState({}), [err, e] = useState(''), set = (k) => (x) => s({ ...v, [k]: x.target.value });
  return <form className="card form" onSubmit={async (x) => { x.preventDefault(); try { await onSubmit(v); s({}); e(''); } catch (z) { e(z.message); } }}>
    {fields.map(([k, l, t = 'text', o]) => <label key={k}>{l}
      {o ? <select required value={v[k] || ''} onChange={set(k)}><option value="">Select</option>{o.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
        : <input required={!l.includes('optional')} type={t} value={v[k] || ''} onChange={set(k)} />}</label>)}
    {err && <p className="err">{err}</p>}<button>{btn}</button></form>; }
const Table = ({ cols, rows }) => <div className="card scroll"><table><thead><tr>{cols.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr></thead>
  <tbody>{rows.map((r) => <tr key={r._id}>{cols.map((c) => <td key={c[0]}>{c[1](r)}</td>)}</tr>)}</tbody></table>
  {!rows.length && <p className="muted">Nothing here yet.</p>}</div>;

function Book() { const [docs] = useLoad('/doctors');
  return <Form btn="Book appointment" onSubmit={async (v) => { await post('/appointments', v); alert('Appointment booked'); }}
    fields={[['doctor', 'Doctor', 'text', docs.map((d) => [d._id, `${d.name} (${d.specialization})`])], ['date', 'Date and time', 'datetime-local'], ['reason', 'Reason for visit']]} />; }

const NEXT = { Booked: ['Confirmed', 'Cancelled'], Confirmed: ['Completed', 'Cancelled'] };
function Appts({ role }) { const [d, l] = useLoad('/appointments');
  const set = (id, status) => post('/appointments/' + id, { status }, 'PATCH').then(l).catch((e) => alert(e.message));
  return <Table rows={d} cols={[['Patient', (a) => a.patient?.name], ['Doctor', (a) => a.doctor?.name], ['When', (a) => new Date(a.date).toLocaleString()], ['Reason', (a) => a.reason],
    ['Status', (a) => <b className={'pill ' + a.status}>{a.status}</b>],
    ['', (a) => (NEXT[a.status] || []).filter((s) => role !== 'patient' || s === 'Cancelled').map((s) => <button key={s} className="sm" onClick={() => set(a._id, s)}>{s}</button>)]]} />; }

function Prescribe() { const [pts] = useLoad('/patients'), [meds] = useLoad('/medicines');
  return <Form btn="Send to pharmacy" onSubmit={async (v) => { await post('/prescriptions', v); alert('Prescription sent'); }}
    fields={[['patient', 'Patient', 'text', pts.map((p) => [p._id, p.name])], ['medicine', 'Medicine', 'text', meds.map((m) => [m._id, m.name])], ['qty', 'Quantity', 'number'], ['notes', 'Dosage notes']]} />; }

function Rx({ role }) { const [d, l] = useLoad('/prescriptions');
  const go = (id) => post(`/prescriptions/${id}/dispense`).then(l).catch((e) => alert(e.message));
  return <Table rows={d} cols={[['Patient', (r) => r.patient?.name], ['Doctor', (r) => r.doctor?.name], ['Medicine', (r) => r.items.map((i) => `${i.medicine?.name} × ${i.qty}`).join(', ')], ['Notes', (r) => r.notes],
    ['Status', (r) => <b className={'pill ' + (r.dispensed ? 'Completed' : 'Booked')}>{r.dispensed ? 'Dispensed' : 'Pending'}</b>],
    ['', (r) => role === 'pharmacist' && !r.dispensed && <button className="sm" onClick={() => go(r._id)}>Dispense</button>]]} />; }

function Inventory({ role }) { const [d, l] = useLoad('/medicines'), can = role !== 'patient' && role !== 'doctor';
  return <>{can && <Form btn="Add medicine" onSubmit={async (v) => { await post('/medicines', v); l(); }} fields={[['name', 'Medicine name'], ['price', 'Price', 'number'], ['stock', 'Opening stock', 'number']]} />}
    <Table rows={d} cols={[['Medicine', (m) => m.name], ['Price', (m) => '₹' + m.price], ['In stock', (m) => <b className={m.stock < 20 ? 'low' : ''}>{m.stock}</b>],
      ['', (m) => can && <button className="sm" onClick={() => { const n = prompt('Units to add'); n && post('/medicines/' + m._id, { add: n }, 'PATCH').then(l); }}>Restock</button>]]} /></>; }

function Overview() { const [st, setSt] = useState({}); useEffect(() => { api('/stats').then(setSt); }, []);
  return <div className="stats">{Object.entries(st).map(([k, v]) => <div className="stat" key={k}><span>{v}</span>{k}</div>)}</div>; }
function Users() { const [d, l] = useLoad('/users');
  return <><Form btn="Add staff member" onSubmit={async (v) => { await post('/users', v); l(); }}
    fields={[['role', 'Role', 'text', [['doctor', 'Doctor'], ['pharmacist', 'Pharmacist'], ['admin', 'Admin']]], ['name', 'Full name'], ['email', 'Email', 'email'], ['password', 'Password', 'password'], ['specialization', 'Specialization (optional)']]} />
    <Table rows={d} cols={[['Name', (u) => u.name], ['Email', (u) => u.email], ['Role', (u) => <b className="pill Confirmed">{u.role}</b>],
      ['', (u) => <button className="sm danger" onClick={() => confirm('Delete user?') && api('/users/' + u._id, { method: 'DELETE' }).then(l)}>Delete</button>]]} /></>; }

function Auth({ done }) { const [reg, setReg] = useState(false);
  return <div className="auth"><div className="hero"><h1>CareLink</h1><p>One place for patients, doctors, the pharmacy and administrators.</p></div>
    <div><Form key={reg} btn={reg ? 'Create patient account' : 'Log in'} onSubmit={async (v) => done(await post(reg ? '/register' : '/login', v))}
      fields={[...(reg ? [['name', 'Full name'], ['age', 'Age', 'number'], ['gender', 'Gender', 'text', [['Female', 'Female'], ['Male', 'Male'], ['Other', 'Other']]]] : []), ['email', 'Email', 'email'], ['password', 'Password', 'password']]} />
      <p className="link" onClick={() => setReg(!reg)}>{reg ? 'Have an account? Log in' : 'New patient? Create an account'}</p></div></div>; }

const TABS = { patient: ['Book', 'Appointments', 'Prescriptions'], doctor: ['Appointments', 'Prescribe', 'Prescriptions'], pharmacist: ['Prescriptions', 'Inventory'], admin: ['Overview', 'Users', 'Appointments', 'Inventory'] };
export default function App() {
  const [u, setU] = useState(JSON.parse(localStorage.user || 'null')), [tab, setTab] = useState(null);
  if (!u) return <Auth done={(r) => { localStorage.token = r.token; localStorage.user = JSON.stringify(r.user); setU(r.user); }} />;
  const t = tab || TABS[u.role][0], V = { Book: <Book />, Appointments: <Appts role={u.role} />, Prescribe: <Prescribe />, Prescriptions: <Rx role={u.role} />, Inventory: <Inventory role={u.role} />, Overview: <Overview />, Users: <Users /> };
  return <div className="shell"><aside><h2>CareLink</h2><small>{u.name} · {u.role}</small>
    {TABS[u.role].map((x) => <button key={x} className={x === t ? 'on' : ''} onClick={() => setTab(x)}>{x}</button>)}
    <button className="out" onClick={() => { localStorage.clear(); setU(null); }}>Log out</button></aside><main><h1>{t}</h1>{V[t]}</main></div>; }
