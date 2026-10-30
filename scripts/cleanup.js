/**
 * Migration & Cleanup script: cleanup.js
 * 
 * 1. Backs up existing prescriptions collection to backups/prescriptions_<timestamp>.json,
 *    then drops the collection.
 * 2. Deletes notifications with type: 'prescription_ready'.
 * 3. Runs removePlatformFee logic (ClinicSettings platformFee = 0, fixes pending appointment fees).
 * 4. Runs removeVideoAudio logic (sets mode = 'in-clinic', unsets videoCall, notifies patients).
 * 
 * Usage:
 *   node scripts/cleanup.js [--dry-run]
 */

const path = require('path');
module.paths.push(path.join(__dirname, '../backend/node_modules'));
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const { removePlatformFee } = require('./removePlatformFee');
const { removeVideoAudio } = require('./removeVideoAudio');

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/drnutrident';
  console.log(`=== DrNutrident Data Cleanup & Migration ===`);
  console.log(`Connecting to MongoDB (${isDryRun ? 'DRY RUN' : 'LIVE'})...`);
  await mongoose.connect(mongoUri);

  try {
    const db = mongoose.connection.db;

    // --- STEP 1: Prescriptions collection backup & drop ---
    console.log('\n--- Step 1: Prescriptions Collection Cleanup ---');
    const collections = await db.listCollections({ name: 'prescriptions' }).toArray();
    if (collections.length > 0) {
      const Prescription = mongoose.model(
        'LegacyPrescription',
        new mongoose.Schema({}, { strict: false }),
        'prescriptions'
      );
      const docs = await Prescription.find({});
      console.log(`Found ${docs.length} prescription document(s).`);

      if (docs.length > 0) {
        const backupsDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(backupsDir)) {
          fs.mkdirSync(backupsDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupsDir, `prescriptions_${timestamp}.json`);
        fs.writeFileSync(backupFile, JSON.stringify(docs, null, 2), 'utf8');
        console.log(`Backing up prescriptions to: ${backupFile}`);
      }

      if (isDryRun) {
        console.log('[DRY RUN] Would drop collection "prescriptions".');
      } else {
        await db.dropCollection('prescriptions');
        console.log('Successfully dropped collection "prescriptions".');
      }
    } else {
      console.log('Collection "prescriptions" does not exist. Nothing to backup or drop.');
    }

    // --- STEP 2: Notification cleanup ---
    console.log('\n--- Step 2: Prescription Notifications Cleanup ---');
    const Notification = mongoose.model(
      'CleanupNotification',
      new mongoose.Schema({}, { strict: false }),
      'notifications'
    );
    const rxNotifs = await Notification.find({ type: 'prescription_ready' });
    console.log(`Found ${rxNotifs.length} notification(s) with type 'prescription_ready'.`);

    if (isDryRun) {
      console.log(`[DRY RUN] Would delete ${rxNotifs.length} prescription_ready notification(s).`);
    } else if (rxNotifs.length > 0) {
      const delResult = await Notification.deleteMany({ type: 'prescription_ready' });
      console.log(`Deleted ${delResult.deletedCount} prescription_ready notification(s).`);
    }

    // --- STEP 3: Remove Platform Fee ---
    console.log('\n--- Step 3: Platform Fee Removal ---');
    await removePlatformFee({ isDryRun });

    // --- STEP 4: Remove Video & Audio Consultations ---
    console.log('\n--- Step 4: Video & Audio Consultations Removal ---');
    await removeVideoAudio({ isDryRun });

    console.log('\n=== Cleanup completed successfully! ===');
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Cleanup execution failed:', err);
    process.exit(1);
  });
}

module.exports = { run };
