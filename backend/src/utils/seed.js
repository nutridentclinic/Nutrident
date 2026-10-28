// Run with: npm run seed
// Creates the very first admin account and default clinic settings.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const ClinicSettings = require('../models/ClinicSettings');
const logger = require('./logger');
const getSeedAdminConfig = require('./seedAdminConfig');

const run = async () => {
  const admin = getSeedAdminConfig();
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const existing = await User.findOne({ email: admin.email });
    if (!existing) {
      await User.create({
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        password: admin.password,
        role: 'admin',
        isEmailVerified: true,
      });
      logger.info('First admin account created from environment configuration.');
    } else {
      logger.info('First admin already exists, skipping.');
    }

    const settings = await ClinicSettings.findById('default');
    if (!settings) {
      await ClinicSettings.create({
        _id: 'default',
        clinicName: 'Nutrident — Dental and Diet Clinic',
        aboutText: 'Nutrident provides personalized dental care with clinical precision and gentle comfort.',
        openingHours: 'Mon - Sat: 9:00 AM - 8:00 PM\nSunday: By appointment only',
      });
      logger.info('Default clinic settings created.');
    }

    const Treatment = require('../models/Treatment');
    const treatmentCount = await Treatment.countDocuments();
    if (treatmentCount === 0) {
      await Treatment.insertMany([
        { name: 'Comprehensive Dental Consultation', category: 'General', defaultCost: 500, estimatedDurationMinutes: 30, description: 'Complete oral cavity examination and digital diagnosis.' },
        { name: 'Scaling & Polishing (Teeth Cleaning)', category: 'Preventive', defaultCost: 1200, estimatedDurationMinutes: 45, description: 'Ultrasonic removal of plaque and tartar with surface polishing.' },
        { name: 'Composite Dental Filling', category: 'Restorative', defaultCost: 1500, estimatedDurationMinutes: 45, description: 'Tooth-colored aesthetic composite resin restoration.' },
        { name: 'Root Canal Treatment (Single Sitting)', category: 'Endodontics', defaultCost: 4500, estimatedDurationMinutes: 60, description: 'Painless cleaning, shaping, and bio-ceramic obturation.' },
        { name: 'Simple Tooth Extraction', category: 'Oral Surgery', defaultCost: 1000, estimatedDurationMinutes: 30, description: 'Atraumatic tooth removal with local anesthesia.' },
        { name: 'In-Clinic Teeth Whitening', category: 'Cosmetic', defaultCost: 6000, estimatedDurationMinutes: 60, description: 'Professional enamel whitening with LED activation.' },
      ]);
      logger.info('Starter treatment catalog created.');
    }

    const seedDoctor = require('./seedDoctor');
    try {
      await seedDoctor();
      logger.info('Doctor profile verified and seeded.');
    } catch (docErr) {
      logger.warn(`Doctor seeding skipped or deferred: ${docErr.message}`);
    }
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  logger.error('Seed failed. Check database connectivity and seed configuration.');
  process.exitCode = 1;
});