const Dentist = require('../models/Dentist');
const AppError = require('./appError');
const logger = require('./logger');

/**
 * Deterministically resolves the single clinic dentist.
 * Prefers verified and active dentist profiles, ordered by createdAt.
 */
async function getClinicDentist(options = {}) {
  const { populateUser = true, populateSelect = 'name profilePhoto phone email active' } = options;

  let query = Dentist.findOne().sort({ isVerified: -1, isActive: -1, createdAt: 1 });
  if (populateUser) {
    query = query.populate('user', populateSelect);
  }

  const dentist = await query.exec();

  // If there are multiple dentist documents in single dentist mode, log it
  if (dentist && process.env.SINGLE_DENTIST_MODE !== 'false') {
    const count = await Dentist.countDocuments();
    if (count > 1) {
      logger.warn(`Clinic has ${count} dentist documents. Resolving primary verified doctor: ${dentist._id}`);
    }
  }

  return dentist;
}

/**
 * Resolves the primary dentist and validates an optional requestedDentistId against it.
 */
async function resolvePrimaryDentist(requestedDentistId) {
  const primary = await getClinicDentist({
    populateUser: true,
    populateSelect: 'name profilePhoto phone email active',
  });

  if (!primary) {
    throw new AppError('No dentist is configured for this clinic.', 404);
  }

  if (requestedDentistId && String(primary._id) !== String(requestedDentistId)) {
    throw new AppError('The specified dentist is not the clinic doctor.', 400);
  }

  return primary;
}

module.exports = {
  getClinicDentist,
  resolvePrimaryDentist,
};
