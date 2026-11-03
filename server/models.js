// Domain layer. User is the base class; Patient/Doctor/Pharmacist/Admin extend it (inheritance + polymorphism via discriminators).
const m = require('mongoose');
const ref = (to) => ({ type: m.Schema.Types.ObjectId, ref: to });
const User = m.model('User', new m.Schema(
  { name: { type: String, required: true }, email: { type: String, unique: true, required: true }, password: String },
  { discriminatorKey: 'role', timestamps: true }));
const Patient = User.discriminator('patient', new m.Schema({ age: Number, gender: String }));
const Doctor = User.discriminator('doctor', new m.Schema({ specialization: String }));
const Pharmacist = User.discriminator('pharmacist', new m.Schema({}));
const Admin = User.discriminator('admin', new m.Schema({}));
const Appointment = m.model('Appointment', new m.Schema({
  patient: ref('User'), doctor: ref('User'), date: Date, reason: String,
  status: { type: String, enum: ['Booked', 'Confirmed', 'Completed', 'Cancelled'], default: 'Booked' } }, { timestamps: true }));
const Medicine = m.model('Medicine', new m.Schema({ name: String, price: Number, stock: { type: Number, min: 0, default: 0 } }));
const Prescription = m.model('Prescription', new m.Schema({
  patient: ref('User'), doctor: ref('User'), notes: String, dispensed: { type: Boolean, default: false },
  items: [{ medicine: ref('Medicine'), qty: Number }] }, { timestamps: true }));
module.exports = { User, Patient, Doctor, Pharmacist, Admin, Appointment, Medicine, Prescription };
