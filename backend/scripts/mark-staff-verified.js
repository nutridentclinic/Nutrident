/**
 * One-off migration script: sets isEmailVerified=true for every non-patient user.
 *
 * Usage:
 *   node scripts/mark-staff-verified.js            # Dry-run mode (default, makes no changes)
 *   node scripts/mark-staff-verified.js --apply    # Applies updates to the database
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  const isApply = process.argv.includes('--apply');
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('Error: MONGO_URI environment variable is not defined.');
    process.exit(1);
  }

  console.log(`=== Mark Staff Verified Migration (${isApply ? 'APPLY MODE' : 'DRY RUN MODE'}) ===`);
  console.log('Connecting to database...');
  await mongoose.connect(mongoUri);

  const User = mongoose.model(
    'User',
    new mongoose.Schema({
      role: String,
      isEmailVerified: Boolean,
      email: String,
    })
  );

  const nonPatientFilter = {
    role: { $in: ['dentist', 'receptionist', 'admin'] },
  };

  const totalNonPatients = await User.countDocuments(nonPatientFilter);
  const unverifiedNonPatients = await User.countDocuments({
    ...nonPatientFilter,
    isEmailVerified: { $ne: true },
  });
  const alreadyVerifiedNonPatients = totalNonPatients - unverifiedNonPatients;

  console.log(`Total non-patient accounts found: ${totalNonPatients}`);
  console.log(`Already verified: ${alreadyVerifiedNonPatients}`);
  console.log(`Needing verification update: ${unverifiedNonPatients}`);

  if (unverifiedNonPatients === 0) {
    console.log('No unverified staff accounts need updating.');
  } else if (!isApply) {
    console.log('\nDRY RUN: No modifications were made.');
    console.log('To apply these changes, re-run with: node scripts/mark-staff-verified.js --apply');
  } else {
    const result = await User.updateMany(
      { ...nonPatientFilter, isEmailVerified: { $ne: true } },
      { $set: { isEmailVerified: true } }
    );
    console.log(`\nAPPLIED: Successfully marked ${result.modifiedCount} non-patient accounts as verified.`);
  }

  await mongoose.disconnect();
  console.log('Disconnected from database. Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
