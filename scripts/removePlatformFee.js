/**
 * Migration script: removePlatformFee.js
 * 
 * 1. Sets ClinicSettings.platformFee = 0 (or unsets it)
 * 2. Recomputes totalAmount = consultationFee for unpaid pending appointments so patients
 *    are not charged the legacy platform fee.
 * 
 * Usage:
 *   node scripts/removePlatformFee.js [--dry-run]
 */

const path = require('path');
module.paths.push(path.join(__dirname, '../backend/node_modules'));
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const isDryRun = process.argv.includes('--dry-run');

async function removePlatformFee({ isDryRun = false } = {}) {
  const ClinicSettings = mongoose.model(
    'ClinicSettings',
    new mongoose.Schema({}, { strict: false }),
    'clinicsettings'
  );
  const Appointment = mongoose.model(
    'Appointment',
    new mongoose.Schema({}, { strict: false }),
    'appointments'
  );

  // 1. Update ClinicSettings
  const settings = await ClinicSettings.findById('default');
  if (settings) {
    console.log(`Found ClinicSettings 'default'. Current platformFee: ${settings.platformFee}`);
    if (!isDryRun) {
      await ClinicSettings.findByIdAndUpdate('default', {
        $set: { platformFee: 0 },
      });
      console.log("Updated ClinicSettings 'default' platformFee to 0.");
    } else {
      console.log("[DRY RUN] Would set ClinicSettings 'default' platformFee to 0.");
    }
  } else {
    console.log("ClinicSettings 'default' not found.");
  }

  // 2. Find unpaid pending appointments with platform fee > 0 or totalAmount > consultationFee
  const pendingAppointments = await Appointment.find({
    status: 'pending',
    paymentStatus: 'pending',
  });

  let updatedCount = 0;
  for (const appt of pendingAppointments) {
    const fees = appt.fees || {};
    const consultFee = fees.consultationFee ?? 0;
    const platFee = fees.platformFee ?? 0;
    const discount = fees.discountAmount ?? 0;
    const expectedTotal = Math.max(0, consultFee - discount);

    if (platFee > 0 || fees.totalAmount !== expectedTotal) {
      updatedCount++;
      if (!isDryRun) {
        await Appointment.findByIdAndUpdate(appt._id, {
          $set: {
            'fees.platformFee': 0,
            'fees.totalAmount': expectedTotal,
          },
        });
      }
    }
  }

  console.log(
    `${isDryRun ? '[DRY RUN] Would update' : 'Updated'} ${updatedCount} unpaid pending appointment(s) to totalAmount = consultationFee.`
  );
  console.log('Platform fee migration completed successfully.');
  return { updatedCount };
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/drnutrident';
  console.log(`Connecting to MongoDB (${isDryRun ? 'DRY RUN' : 'LIVE'})...`);
  await mongoose.connect(mongoUri);

  try {
    await removePlatformFee({ isDryRun });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { run, removePlatformFee };
