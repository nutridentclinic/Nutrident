const { sendEmail } = require('../config/email');
const { templates } = require('./emailTemplates');
const EmailLog = require('../models/EmailLog');
const logger = require('../utils/logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a transactional email with up to 3 retries, exponential backoff,
 * and audit logging in EmailLog collection.
 */
async function sendTransactionalEmail({ to, template, data = {}, relatedId = null, metadata = {} }) {
  if (!to) {
    logger.warn(`sendTransactionalEmail: Missing recipient address for template "${template}"`);
    return { success: false, error: 'Recipient email address is required' };
  }

  const templateFn = templates[template];
  if (!templateFn) {
    logger.warn(`sendTransactionalEmail: Unknown template "${template}"`);
    return { success: false, error: `Unknown template: ${template}` };
  }

  const { subject, html, text } = templateFn(data);

  let attempts = 0;
  let lastError = null;
  const maxAttempts = 3;
  const backoffDelays = [500, 1000, 2000];

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const result = await sendEmail({ to, subject, html, text });

      // Log success
      try {
        await EmailLog.create({
          to,
          template,
          subject,
          status: 'sent',
          relatedId,
          metadata: { ...metadata, messageId: result?.messageId },
          attempts,
        });
      } catch (logErr) {
        logger.error(`Failed to write EmailLog: ${logErr.message}`);
      }

      return { success: true, attempts, result };
    } catch (err) {
      lastError = err;
      logger.warn(`sendTransactionalEmail attempt ${attempts} failed for ${to} (${template}): ${err.message}`);
      if (attempts < maxAttempts) {
        await sleep(backoffDelays[attempts - 1] || 1000);
      }
    }
  }

  // All attempts failed
  try {
    await EmailLog.create({
      to,
      template,
      subject,
      status: 'failed',
      error: lastError?.message || 'Failed after max retries',
      relatedId,
      metadata,
      attempts,
    });
  } catch (logErr) {
    logger.error(`Failed to write failure EmailLog: ${logErr.message}`);
  }

  return { success: false, attempts, error: lastError?.message };
}

module.exports = {
  sendTransactionalEmail,
};

