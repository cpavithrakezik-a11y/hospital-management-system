const express = require('express'), cors = require('cors'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs'), mongoose = require('mongoose');
const { User, Patient, Doctor, Pharmacist, Admin, Appointment, Medicine, Prescription } = require('./models');
const SECRET = process.env.JWT_SECRET || 'hms-dev-secret';
const clientOrigins = process.env.CLIENT_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
const app = express(); app.use(cors({ origin: clientOrigins?.length ? clientOrigins : true }), express.json());

// Factory pattern: one place decides which subclass to instantiate.
const UserFactory = { create(role, d) {
  const C = { patient: Patient, doctor: Doctor, pharmacist: Pharmacist, admin: Admin }[role];
  if (!C) throw Error('Unknown role'); const { role: _r, ...x } = d;
  return C.create({ ...x, password: bcrypt.hashSync(d.password, 8) }); } };
// Chain of responsibility: each request passes authentication, then role authorisation, then the handler.
const auth = (...roles) => (q, s, n) => { try {
  q.user = jwt.verify((q.headers.authorization || '').slice(7), SECRET);
  if (roles.length && !roles.includes(q.user.role)) return s.status(403).json({ error: 'Not allowed for your role' }); n();
} catch { s.status(401).json({ error: 'Please log in' }); } };
const wrap = (f) => (q, s) => f(q, s).catch((e) => s.status(400).json({ error: e.message }));
const sign = (u) => ({ token: jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: '1d' }), user: { id: u.id, name: u.name, role: u.role } });
const mine = (q) => ({ patient: { patient: q.user.id }, doctor: { doctor: q.user.id } }[q.user.role] || {});

app.post('/api/register', wrap(async (q, s) => s.json(sign(await UserFactory.create('patient', q.body)))));
app.post('/api/login', wrap(async (q, s) => { const u = await User.findOne({ email: q.body.email });
  if (!u || !bcrypt.compareSync(q.body.password, u.password)) throw Error('Wrong email or password'); s.json(sign(u)); }));

// Admin
app.get('/api/users', auth('admin'), wrap(async (q, s) => s.json(await User.find({}, '-password'))));
app.post('/api/users', auth('admin'), wrap(async (q, s) => s.json(await UserFactory.create(q.body.role, q.body))));
app.delete('/api/users/:id', auth('admin'), wrap(async (q, s) => { await User.findByIdAndDelete(q.params.id); s.json({ ok: 1 }); }));
app.get('/api/stats', auth('admin'), wrap(async (q, s) => s.json({
  Patients: await Patient.countDocuments(), Doctors: await Doctor.countDocuments(), Pharmacists: await Pharmacist.countDocuments(),
  Appointments: await Appointment.countDocuments(), Prescriptions: await Prescription.countDocuments(),
  'Low stock': await Medicine.countDocuments({ stock: { $lt: 20 } }) })));
app.get('/api/doctors', auth(), wrap(async (q, s) => s.json(await Doctor.find({}, 'name specialization'))));
app.get('/api/patients', auth('doctor', 'admin'), wrap(async (q, s) => s.json(await Patient.find({}, 'name age gender'))));

// Appointments: simple State pattern (allowed transitions table)
const NEXT = { Booked: ['Confirmed', 'Cancelled'], Confirmed: ['Completed', 'Cancelled'], Completed: [], Cancelled: [] };
app.post('/api/appointments', auth('patient'), wrap(async (q, s) => s.json(await Appointment.create({ ...q.body, patient: q.user.id }))));
app.get('/api/appointments', auth(), wrap(async (q, s) => s.json(await Appointment.find(mine(q)).populate('patient doctor', 'name').sort('-date'))));
app.patch('/api/appointments/:id', auth('patient', 'doctor', 'admin'), wrap(async (q, s) => {
  const a = await Appointment.findById(q.params.id), to = q.body.status;
  if (!NEXT[a.status].includes(to)) throw Error(`Cannot change ${a.status} to ${to}`);
  if (q.user.role === 'patient' && to !== 'Cancelled') throw Error('Patients can only cancel');
  a.status = to; s.json(await a.save()); }));

// Pharmacy
app.get('/api/medicines', auth(), wrap(async (q, s) => s.json(await Medicine.find().sort('name'))));
app.post('/api/medicines', auth('pharmacist', 'admin'), wrap(async (q, s) => s.json(await Medicine.create(q.body))));
app.patch('/api/medicines/:id', auth('pharmacist', 'admin'), wrap(async (q, s) =>
  s.json(await Medicine.findByIdAndUpdate(q.params.id, { $inc: { stock: +q.body.add } }, { new: true }))));
app.post('/api/prescriptions', auth('doctor'), wrap(async (q, s) => {
  const { patient, medicine, qty, notes } = q.body;
  s.json(await Prescription.create({ patient, notes, doctor: q.user.id, items: [{ medicine, qty }] })); }));
app.get('/api/prescriptions', auth(), wrap(async (q, s) => s.json(await Prescription.find(mine(q))
  .populate('patient doctor', 'name').populate('items.medicine', 'name').sort('-createdAt'))));
app.post('/api/prescriptions/:id/dispense', auth('pharmacist'), wrap(async (q, s) => {
  const p = await Prescription.findById(q.params.id).populate('items.medicine');
  if (p.dispensed) throw Error('Already dispensed');
  for (const i of p.items) if (i.medicine.stock < i.qty) throw Error('Not enough stock: ' + i.medicine.name);
  for (const i of p.items) await Medicine.findByIdAndUpdate(i.medicine._id, { $inc: { stock: -i.qty } });
  p.dispensed = true; s.json(await p.save()); }));

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hms').then(async () => {
  if (!(await Admin.findOne())) { // seed demo data
    await UserFactory.create('admin', { name: 'Admin', email: 'admin@hms.com', password: 'admin123' });
    await UserFactory.create('doctor', { name: 'Dr. Meera Nair', email: 'doctor@hms.com', password: 'doctor123', specialization: 'Cardiology' });
    await UserFactory.create('pharmacist', { name: 'Ravi Kumar', email: 'pharmacy@hms.com', password: 'pharma123' });
    await Medicine.insertMany([{ name: 'Paracetamol 500mg', price: 2, stock: 200 }, { name: 'Amoxicillin 250mg', price: 8, stock: 80 }, { name: 'Cetirizine 10mg', price: 3, stock: 120 }]);
  }
  app.listen(process.env.PORT || 5000, '0.0.0.0', () => {
  console.log('API running');
});
});
