const Clinic = require('../models/Clinic');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');

exports.createClinic = catchAsync(async (req, res) => {
  const clinic = await Clinic.create(req.body);
  success(res, 201, 'Clinic created.', clinic);
});

exports.getClinics = catchAsync(async (req, res) => {
  const { city, search } = req.query;
  const filter = { isActive: true };
  if (city) filter['address.city'] = new RegExp(city, 'i');
  if (search) filter.name = new RegExp(search, 'i');

  const clinics = await Clinic.find(filter).sort('name');
  success(res, 200, 'Clinics fetched.', clinics);
});

exports.getNearbyClinics = catchAsync(async (req, res, next) => {
  const { lng, lat, radiusKm = 10 } = req.query;
  if (!lng || !lat) return next(new AppError('lng and lat query params are required.', 400));

  const clinics = await Clinic.find({
    isActive: true,
    'address.location': {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: Number(radiusKm) * 1000,
      },
    },
  });

  success(res, 200, 'Nearby clinics fetched.', clinics);
});

exports.getClinicById = catchAsync(async (req, res, next) => {
  const clinic = await Clinic.findById(req.params.id);
  if (!clinic) return next(new AppError('Clinic not found.', 404));
  success(res, 200, 'Clinic fetched.', clinic);
});

exports.getClinicDentists = catchAsync(async (req, res) => {
  const dentists = await Dentist.find({ clinic: req.params.id, isActive: true, isVerified: true }).populate(
    'user',
    'name profilePhoto'
  );
  success(res, 200, 'Dentists fetched.', dentists);
});

exports.updateClinic = catchAsync(async (req, res, next) => {
  const clinic = await Clinic.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!clinic) return next(new AppError('Clinic not found.', 404));
  success(res, 200, 'Clinic updated.', clinic);
});

exports.assignDentist = catchAsync(async (req, res, next) => {
  const { dentistId } = req.body;
  const clinic = await Clinic.findById(req.params.id);
  if (!clinic) return next(new AppError('Clinic not found.', 404));

  const dentist = await Dentist.findByIdAndUpdate(dentistId, { clinic: clinic._id }, { new: true });
  if (!dentist) return next(new AppError('Dentist not found.', 404));

  success(res, 200, 'Dentist assigned to clinic.', dentist);
});

exports.deactivateClinic = catchAsync(async (req, res, next) => {
  const clinic = await Clinic.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!clinic) return next(new AppError('Clinic not found.', 404));
  success(res, 200, 'Clinic deactivated.', clinic);
});