/**
 * Migration script: removeVideoAudio.js
 * 
 * 1. Updates existing appointments with mode 'video' or 'audio' to 'in-clinic'.
 * 2. Unsets legacy videoCall field.
 * 3. Identifies upcoming video/audio appointments (confirmed/pending) and notifies patients.
 * 
 * Usage:
 *   node scripts/removeVideoAudio.js [--dry-run]
 */

const path = require('path');
module.paths.push(path.join(__dirname, '../backend/node_modules'));
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const isDryRun = process.argv.includes('--dry-run');

async function removeVideoAudio({ isDryRun = false } = {}) {
  const Appointment = mongoose.model(
    'Appointment',
    new mongoose.Schema({}, { strict: false }),
    'appointments'
  );
  const Notification = mongoose.model(
    'Notification',
    new mongoose.Schema({}, { strict: false }),
    'notifications'
  );

  const query = {
    $or: [
      { mode: { $in: ['video', 'audio'] } },
      { 'videoCall.roomId': { $exists: true, $ne: null } },
    ],
  };

  const matches = await Appointment.find(query);
  console.log(`Found ${matches.length} appointments with legacy video/audio attributes.`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let updatedCount = 0;
  let notifiedCount = 0;

  for (const appt of matches) {
    const isUpcoming = appt.date && new Date(appt.date) >= today && ['pending', 'confirmed'].includes(appt.status);

    if (isDryRun) {
      console.log(`[DRY RUN] Would update appointment ${appt._id} (date: ${appt.date?.toISOString?.()?.slice(0, 10)}, status: ${appt.status}, mode: ${appt.mode}) to in-clinic.`);
      if (isUpcoming && appt.patient) {
        console.log(`[DRY RUN] Would notify patient ${appt.patient} regarding mode change to in-clinic.`);
      }
    } else {
      await Appointment.findByIdAndUpdate(appt._id, {
        $set: { mode: 'in-clinic' },
        $unset: { videoCall: '' },
      });
      updatedCount++;

      if (isUpcoming && appt.patient) {
        await Notification.create({
          user: appt.patient,
          title: 'Consultation Mode Updated',
          message: `Your appointment on ${appt.date ? new Date(appt.date).toLocaleDateString() : 'your scheduled date'} at ${appt.startTime || ''} is scheduled as an in-clinic visit. Remote video/audio consultations have been discontinued.`,
          type: 'general',
          link: '/app/appointments',
        });
        notifiedCount++;
      }
    }
  }

  console.log(`Done. Updated: ${isDryRun ? matches.length + ' (dry-run)' : updatedCount}, Notifications sent: ${isDryRun ? 'dry-run' : notifiedCount}`);
  return { updatedCount, notifiedCount, totalFound: matches.length };
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/drnutrident';
  console.log(`Connecting to MongoDB (${isDryRun ? 'DRY RUN' : 'LIVE'})...`);
  await mongoose.connect(mongoUri);

  try {
    await removeVideoAudio({ isDryRun });
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { removeVideoAudio };
