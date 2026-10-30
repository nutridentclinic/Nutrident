/**
 * Migration Script: removePendingAppointments.js
 * 
 * 1. Finds all existing appointments with status: 'pending'.
 * 2. If paymentStatus === 'paid': converts to status: 'confirmed'.
 * 3. If paymentStatus !== 'paid': cancels the appointment (status: 'cancelled', cancelledBy: 'system').
 * 
 * Usage:
 *   node scripts/removePendingAppointments.js [--dry-run]
 */

const path = require('path');
module.paths.push(path.join(__dirname, '../backend/node_modules'));
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const Appointment = require('../backend/src/models/Appointment');

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/drnutrident';
  console.log('=== DrNutrident Remove Pending Appointments Migration ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no DB writes)' : 'LIVE EXECUTION'}`);
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);

  try {
    const pendingAppts = await Appointment.find({ status: 'pending' });
    console.log(`Found ${pendingAppts.length} pending appointment(s).\n`);

    let confirmedCount = 0;
    let cancelledCount = 0;

    for (const appt of pendingAppts) {
      if (appt.paymentStatus === 'paid') {
        console.log(`[Appt ${appt._id}] Paid pending appointment -> converting to CONFIRMED`);
        if (!isDryRun) {
          appt.status = 'confirmed';
          await appt.save();
        }
        confirmedCount++;
      } else {
        console.log(`[Appt ${appt._id}] Unpaid pending appointment -> CANCELLING (cancelledBy: system)`);
        if (!isDryRun) {
          appt.status = 'cancelled';
          appt.cancelledBy = 'system';
          appt.cancellationReason = 'Online payment migration: removed pending unconfirmed appointment';
          await appt.save();
        }
        cancelledCount++;
      }
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Total Pending Found:    ${pendingAppts.length}`);
    console.log(`Converted to Confirmed: ${confirmedCount} ${isDryRun ? '(Dry run)' : ''}`);
    console.log(`Cancelled & Released:   ${cancelledCount} ${isDryRun ? '(Dry run)' : ''}`);
    console.log('Migration completed successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal error during removePendingAppointments execution:', err);
    process.exit(1);
  });
}

module.exports = { run };

