require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Dentist = require('../models/Dentist');
const logger = require('./logger');
const getSeedDoctorConfig = require('./seedDoctorConfig');

const getDefaultWeeklyAvailability = () => {
  // Days 1 to 6 (Monday to Saturday): 09:00-13:00 and 14:00-20:00 (lunch break 13:00-14:00)
  const days = [];
  for (let day = 1; day <= 6; day += 1) {
    days.push({
      day,
      slots: [
        { startTime: '09:00', endTime: '13:00' },
        { startTime: '14:00', endTime: '20:00' },
      ],
    });
  }
  return days;
};

const seedDoctor = async () => {
  const config = getSeedDoctorConfig();

  // 1. Find or create the doctor User
  let doctorUser = await User.findOne({ email: config.email }).select('+password +active');
  if (!doctorUser) {
    // Check if phone is already taken by another user
    const existingPhone = await User.findOne({ phone: config.phone });
    if (existingPhone && existingPhone.email !== config.email) {
      logger.warn(`Phone number ${config.phone} belongs to another user (${existingPhone.email}). Reassigning...`);
      existingPhone.phone = `${config.phone}_archived_${Date.now()}`;
      await existingPhone.save({ validateBeforeSave: false });
    }

    doctorUser = await User.create({
      name: config.name,
      email: config.email,
      phone: config.phone,
      password: config.password,
      role: 'dentist',
      isEmailVerified: true,
      active: true,
    });
    logger.info(`Doctor user account created for ${config.email}.`);
  } else {
    // Update doctor user fields idempotently
    doctorUser.name = config.name;
    doctorUser.role = 'dentist';
    doctorUser.isEmailVerified = true;
    doctorUser.active = true;
    if (doctorUser.phone !== config.phone) {
      const existingPhone = await User.findOne({ phone: config.phone });
      if (existingPhone && !existingPhone._id.equals(doctorUser._id)) {
        existingPhone.phone = `${config.phone}_archived_${Date.now()}`;
        await existingPhone.save({ validateBeforeSave: false });
      }
      doctorUser.phone = config.phone;
    }
    // Only update password if explicitly changed in env
    if (config.password && process.env.DOCTOR_PASSWORD) {
      doctorUser.password = config.password;
    }
    await doctorUser.save();
    logger.info(`Doctor user account updated for ${config.email}.`);
  }

  // 2. Find or create the Dentist profile for this doctor
  let dentistProfile = await Dentist.findOne({ user: doctorUser._id });
  const weeklyAvailability = getDefaultWeeklyAvailability();

  if (!dentistProfile) {
    dentistProfile = await Dentist.create({
      user: doctorUser._id,
      specialization: config.specialization,
      qualifications: config.qualifications,
      experienceYears: config.experienceYears,
      consultationFee: config.consultationFee,
      about: 'Chief Dental Clinician dedicated to comprehensive oral health and aesthetic rehabilitation.',
      languages: ['English', 'Hindi', 'Marathi'],
      clinicAddress: {
        addressLine: 'Shop 4, Sunrise Plaza, MG Road',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
      },
      isVerified: true,
      isActive: true,
      weeklyAvailability,
      slotDurationMinutes: 30,
    });
    logger.info(`Doctor profile created for Dr. ${doctorUser.name}.`);
  } else {
    dentistProfile.specialization = config.specialization;
    dentistProfile.qualifications = config.qualifications;
    dentistProfile.experienceYears = config.experienceYears;
    dentistProfile.consultationFee = config.consultationFee;
    dentistProfile.isVerified = true;
    dentistProfile.isActive = true;
    dentistProfile.pausedReason = '';
    dentistProfile.pausedUntil = null;
    if (!dentistProfile.weeklyAvailability || dentistProfile.weeklyAvailability.length === 0) {
      dentistProfile.weeklyAvailability = weeklyAvailability;
    }
    if (!dentistProfile.slotDurationMinutes) {
      dentistProfile.slotDurationMinutes = 30;
    }
    await dentistProfile.save();
    logger.info(`Doctor profile updated for Dr. ${doctorUser.name}.`);
  }

  // 3. Delete or deactivate every other dentist User + Dentist docs and log what was removed
  const otherDentistProfiles = await Dentist.find({ user: { $ne: doctorUser._id } });
  for (const other of otherDentistProfiles) {
    logger.info(`Removed auxiliary dentist profile (id: ${other._id}, user: ${other.user}) to maintain single-doctor practice.`);
    await Dentist.findByIdAndDelete(other._id);
  }

  const otherDentistUsers = await User.find({
    role: 'dentist',
    _id: { $ne: doctorUser._id },
  });
  for (const otherUser of otherDentistUsers) {
    otherUser.active = false;
    otherUser.role = 'patient'; // demote to avoid active doctor logins
    await otherUser.save({ validateBeforeSave: false });
    logger.info(`Deactivated and demoted auxiliary dentist user: ${otherUser.email} (id: ${otherUser._id})`);
  }

  return { user: doctorUser, dentist: dentistProfile };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    await seedDoctor();
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  run().catch((err) => {
    logger.error(`Doctor seed failed: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = seedDoctor;
