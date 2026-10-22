const sameId = (left, right) => String(left?._id || left) === String(right?._id || right);

module.exports = (user, dentistId, dentistProfile) => {
  if (!user) return false;
  if (['admin', 'receptionist'].includes(user.role)) return true;
  return user.role === 'dentist' && sameId(dentistProfile?._id, dentistId) && sameId(dentistProfile?.user, user._id || user.id);
};