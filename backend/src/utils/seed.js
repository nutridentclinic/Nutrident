// Run with: npm run seed
// Creates the very first admin account and default clinic settings.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const ClinicSettings = require('../models/ClinicSettings');
const logger = require('./logger');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const adminEmail = 'admin@clinic.com';
  const existing = await User.findOne({ email: adminEmail });

  if (!existing) {
    await User.create({
      name: 'Clinic Admin',
      email: adminEmail,
      phone: '9999999999',
      password: 'Admin@123', // change immediately after first login
      role: 'admin',
      isEmailVerified: true,
    });
    logger.info(`Admin created -> email: ${adminEmail} / password: Admin@123 (change this immediately)`);
  } else {
    logger.info('Admin already exists, skipping.');
  }

  const settings = await ClinicSettings.findById('default');
  if (!settings) {
    await ClinicSettings.create({ _id: 'default' });
    logger.info('Default clinic settings created.');
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});