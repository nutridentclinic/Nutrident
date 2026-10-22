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
      await ClinicSettings.create({ _id: 'default' });
      logger.info('Default clinic settings created.');
    }
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  logger.error('Seed failed. Check database connectivity and seed configuration.');
  process.exitCode = 1;
});