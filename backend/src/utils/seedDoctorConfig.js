module.exports = (env = process.env) => {
  const email = String(env.DOCTOR_EMAIL || 'siddheshvpatil02@gmail.com').trim().toLowerCase();
  const password = String(env.DOCTOR_PASSWORD || 'Dentist@123');
  const phone = String(env.DOCTOR_PHONE || '+919876543210').trim();
  const name = String(env.DOCTOR_NAME || 'Dr. Siddhesh Patil').trim();
  const specialization = String(env.DOCTOR_SPECIALIZATION || 'Chief Dental Surgeon & Implantologist').trim();
  const qualifications = String(env.DOCTOR_QUALIFICATIONS || 'BDS, MDS (Oral & Maxillofacial Surgery)')
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean);
  const experienceYears = Number(env.DOCTOR_EXPERIENCE_YEARS) || 10;
  const consultationFee = Number(env.DOCTOR_CONSULTATION_FEE) || 500;

  if (!email || !password || !phone) {
    throw new Error('DOCTOR_EMAIL, DOCTOR_PASSWORD, and DOCTOR_PHONE are required to seed the doctor.');
  }

  return {
    email,
    password,
    phone,
    name,
    specialization,
    qualifications,
    experienceYears,
    consultationFee,
  };
};
