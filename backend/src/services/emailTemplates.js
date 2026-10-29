function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout({ title, content, clinicName = 'DrNutrident Dental Clinic', clinicPhone = '+91 98765 43210', clinicAddress = '123 Health Ave, Clinic Suite' }) {
  const safeClinicName = escapeHtml(clinicName);
  const safeClinicPhone = escapeHtml(clinicPhone);
  const safeClinicAddress = escapeHtml(clinicAddress);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; line-height: 1.6; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: #0f172a; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .body { padding: 32px 24px; }
    .card { background: #f1f5f9; border-radius: 6px; padding: 16px; margin: 20px 0; border-left: 4px solid #2563eb; }
    .card p { margin: 6px 0; font-size: 14px; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 16px; }
    .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${safeClinicName}</h1>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p><strong>${safeClinicName}</strong></p>
      <p>${safeClinicAddress} · Phone: ${safeClinicPhone}</p>
      <p>This is an automated appointment & health service notification.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

const templates = {
  appointmentBooked({ patientName, doctorName, date, time, mode = 'in-clinic', clinicName, clinicPhone, clinicAddress, appointmentId }) {
    const safePatient = escapeHtml(patientName || 'Patient');
    const safeDoctor = escapeHtml(doctorName || 'Doctor');
    const safeDate = escapeHtml(date);
    const safeTime = escapeHtml(time);
    const safeMode = escapeHtml(mode === 'video' ? 'Video Consultation' : 'In-Clinic Visit');

    const subject = `Appointment Confirmed: ${safeDate} at ${safeTime} - ${clinicName || 'DrNutrident'}`;
    const content = `
      <h2 style="margin-top:0; color:#0f172a;">Appointment Confirmed</h2>
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>Your appointment has been successfully scheduled. Here are your booking details:</p>
      <div class="card">
        <p><strong>Doctor:</strong> Dr. ${safeDoctor}</p>
        <p><strong>Date:</strong> ${safeDate}</p>
        <p><strong>Time:</strong> ${safeTime}</p>
        <p><strong>Consultation Mode:</strong> ${safeMode}</p>
        ${appointmentId ? `<p><strong>Booking Ref:</strong> #${escapeHtml(String(appointmentId).slice(-6).toUpperCase())}</p>` : ''}
      </div>
      <p>Please arrive 10 minutes prior to your scheduled time. If you need to make changes or have questions, contact our front desk.</p>
    `;
    const text = `Hello ${patientName},\n\nYour appointment with Dr. ${doctorName} on ${date} at ${time} (${mode}) is confirmed.\n\n${clinicName || 'DrNutrident Dental Clinic'}\nPhone: ${clinicPhone || '+91 98765 43210'}`;

    return { subject, html: layout({ title: subject, content, clinicName, clinicPhone, clinicAddress }), text };
  },

  appointmentCancelled({ patientName, doctorName, date, time, reason, refundNote, clinicName, clinicPhone }) {
    const safePatient = escapeHtml(patientName || 'Patient');
    const safeDoctor = escapeHtml(doctorName || 'Doctor');
    const safeDate = escapeHtml(date);
    const safeTime = escapeHtml(time);
    const safeReason = escapeHtml(reason || 'Cancelled by request');
    const safeRefund = escapeHtml(refundNote || 'Refunds (if applicable) are processed within 5-7 business days.');

    const subject = `Appointment Cancelled: ${safeDate} at ${safeTime} - ${clinicName || 'DrNutrident'}`;
    const content = `
      <h2 style="margin-top:0; color:#dc2626;">Appointment Cancelled</h2>
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>Your appointment on <strong>${safeDate} at ${safeTime}</strong> with Dr. ${safeDoctor} has been cancelled.</p>
      <div class="card" style="border-left-color: #dc2626;">
        <p><strong>Reason:</strong> ${safeReason}</p>
        <p><strong>Payment Status:</strong> ${safeRefund}</p>
      </div>
      <p>You can book a new appointment at any time through our patient portal or by calling our desk.</p>
    `;
    const text = `Hello ${patientName},\n\nYour appointment on ${date} at ${time} with Dr. ${doctorName} has been cancelled.\nReason: ${reason || 'Cancelled'}\n${refundNote || ''}\n\n${clinicName || 'DrNutrident'}`;

    return { subject, html: layout({ title: subject, content, clinicName, clinicPhone }), text };
  },

  appointmentRescheduled({ patientName, doctorName, oldDate, oldTime, newDate, newTime, reason, clinicName, clinicPhone }) {
    const safePatient = escapeHtml(patientName || 'Patient');
    const safeDoctor = escapeHtml(doctorName || 'Doctor');
    const safeOld = escapeHtml(`${oldDate} at ${oldTime}`);
    const safeNew = escapeHtml(`${newDate} at ${newTime}`);
    const safeReason = reason ? escapeHtml(reason) : null;

    const subject = `Appointment Rescheduled to ${newDate} at ${newTime} - ${clinicName || 'DrNutrident'}`;
    const content = `
      <h2 style="margin-top:0; color:#2563eb;">Appointment Rescheduled</h2>
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>Your visit with Dr. ${safeDoctor} has been rescheduled to a new date and time.</p>
      <div class="card">
        <p><strong>Previous Time:</strong> <strike style="color:#64748b;">${safeOld}</strike></p>
        <p><strong>New Time:</strong> <strong style="color:#16a34a;">${safeNew}</strong></p>
        <p><strong>Doctor:</strong> Dr. ${safeDoctor}</p>
        ${safeReason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : ''}
      </div>
      <p>If this new time does not work for you, please contact us or reschedule via the portal.</p>
    `;
    const text = `Hello ${patientName},\n\nYour appointment with Dr. ${doctorName} has been rescheduled from ${oldDate} ${oldTime} to ${newDate} at ${newTime}.${reason ? `\nReason: ${reason}` : ''}\n\n${clinicName || 'DrNutrident'}`;

    return { subject, html: layout({ title: subject, content, clinicName, clinicPhone }), text };
  },

  appointmentCompleted({ patientName, doctorName, date, reviewUrl, clinicName, clinicPhone }) {
    const safePatient = escapeHtml(patientName || 'Patient');
    const safeDoctor = escapeHtml(doctorName || 'Doctor');
    const safeDate = escapeHtml(date);
    const safeUrl = escapeHtml(reviewUrl || '#');

    const subject = `Thank you for visiting ${clinicName || 'DrNutrident'}!`;
    const content = `
      <h2 style="margin-top:0; color:#0f172a;">Visit Completed</h2>
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>Thank you for visiting us on <strong>${safeDate}</strong> for your consultation with Dr. ${safeDoctor}.</p>
      <p>We hope you had a pleasant experience. Your feedback helps us maintain the highest standard of dental care.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${safeUrl}" class="btn">Leave a Review</a>
      </div>
      <p>Any medical prescriptions or invoices generated for your visit are available in your portal.</p>
    `;
    const text = `Hello ${patientName},\n\nThank you for visiting Dr. ${doctorName} on ${date}. We would love to hear your feedback!\n\nReview link: ${reviewUrl}\n\n${clinicName || 'DrNutrident'}`;

    return { subject, html: layout({ title: subject, content, clinicName, clinicPhone }), text };
  },

  prescriptionIssued({ patientName, doctorName, date, medicines = [], portalUrl, clinicName, clinicPhone }) {
    const safePatient = escapeHtml(patientName || 'Patient');
    const safeDoctor = escapeHtml(doctorName || 'Doctor');
    const safeDate = escapeHtml(date);
    const safeUrl = escapeHtml(portalUrl || '#');

    const medRows = (medicines || [])
      .map(
        (m) => `
        <tr>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${escapeHtml(m.name)}</strong></td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(m.dosage)}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(m.frequency)}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(String(m.durationDays))} days</td>
        </tr>
      `
      )
      .join('');

    const subject = `New Prescription Issued - Dr. ${safeDoctor}`;
    const content = `
      <h2 style="margin-top:0; color:#0f172a;">New Prescription Issued</h2>
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>Dr. ${safeDoctor} has issued a new prescription for your visit on ${safeDate}.</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
        <thead>
          <tr style="background:#f1f5f9; text-align:left;">
            <th style="padding: 8px 10px;">Medicine</th>
            <th style="padding: 8px 10px;">Dosage</th>
            <th style="padding: 8px 10px;">Frequency</th>
            <th style="padding: 8px 10px;">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${medRows}
        </tbody>
      </table>
      <div style="text-align: center; margin: 20px 0;">
        <a href="${safeUrl}" class="btn">View & Download PDF</a>
      </div>
    `;
    const text = `Hello ${patientName},\n\nDr. ${doctorName} has issued a new prescription on ${date}.\n\nView prescription: ${portalUrl}\n\n${clinicName || 'DrNutrident'}`;

    return { subject, html: layout({ title: subject, content, clinicName, clinicPhone }), text };
  },

  invoiceReady({ patientName, invoiceNumber, amount, date, portalUrl, clinicName, clinicPhone }) {
    const safePatient = escapeHtml(patientName || 'Patient');
    const safeInv = escapeHtml(invoiceNumber);
    const safeAmount = escapeHtml(`₹${Number(amount || 0).toLocaleString('en-IN')}`);
    const safeDate = escapeHtml(date);
    const safeUrl = escapeHtml(portalUrl || '#');

    const subject = `Invoice Ready: #${safeInv} - ${clinicName || 'DrNutrident'}`;
    const content = `
      <h2 style="margin-top:0; color:#0f172a;">Invoice Ready</h2>
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>An invoice has been generated for your recent clinic visit.</p>
      <div class="card">
        <p><strong>Invoice Number:</strong> #${safeInv}</p>
        <p><strong>Date:</strong> ${safeDate}</p>
        <p><strong>Total Amount:</strong> <strong>${safeAmount}</strong></p>
      </div>
      <div style="text-align: center; margin: 20px 0;">
        <a href="${safeUrl}" class="btn">View & Download Invoice</a>
      </div>
    `;
    const text = `Hello ${patientName},\n\nYour invoice #${invoiceNumber} for ${safeAmount} on ${date} is ready.\n\nView invoice: ${portalUrl}\n\n${clinicName || 'DrNutrident'}`;

    return { subject, html: layout({ title: subject, content, clinicName, clinicPhone }), text };
  },

  reviewRequest({ patientName, doctorName, reviewUrl, clinicName, clinicPhone }) {
    const safePatient = escapeHtml(patientName || 'Patient');
    const safeDoctor = escapeHtml(doctorName || 'Doctor');
    const safeUrl = escapeHtml(reviewUrl || '#');

    const subject = `How was your visit with Dr. ${safeDoctor}?`;
    const content = `
      <h2 style="margin-top:0; color:#0f172a;">We Value Your Feedback</h2>
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>It's been a few days since your consultation with Dr. ${safeDoctor}.</p>
      <p>Could you take 30 seconds to rate your visit and share your feedback? It helps us provide the best care possible.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${safeUrl}" class="btn">Rate Your Visit ★★★★★</a>
      </div>
    `;
    const text = `Hello ${patientName},\n\nHow was your visit with Dr. ${doctorName}? Please share your feedback at:\n${reviewUrl}\n\n${clinicName || 'DrNutrident'}`;

    return { subject, html: layout({ title: subject, content, clinicName, clinicPhone }), text };
  },
};

module.exports = {
  escapeHtml,
  layout,
  templates,
};

