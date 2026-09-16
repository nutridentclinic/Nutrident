const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const makeStorage = (folder) =>
  new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `dental_clinic/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
      resource_type: 'auto',
    },
  });

module.exports = { cloudinary, makeStorage };