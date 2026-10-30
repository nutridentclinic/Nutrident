const logger = require('../utils/logger');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is not set - cannot send email.');
  }

  const senderEmail = process.env.EMAIL_FROM_ADDRESS || 'nutridentclinic01@gmail.com';
  const senderName = process.env.EMAIL_FROM_NAME || 'Nutrident Dental Clinic';

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`Brevo API error (${response.status}): ${errorBody}`);
    throw new Error(`Brevo API returned ${response.status}: ${errorBody}`);
  }

  return response.json();
};

module.exports = { sendEmail };
