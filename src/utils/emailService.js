const nodemailer = require("nodemailer");
const { TransactionalEmailsApi, SendSmtpEmail } = require("@getbrevo/brevo");

// Brevo API initialization
const brevoEmailAPI = new TransactionalEmailsApi();
if (process.env.BREVO_API_KEY) {
  brevoEmailAPI.setApiKey(0, process.env.BREVO_API_KEY);
} else {
  console.warn(
    "Brevo API is not configured. Please set BREVO_API_KEY environment variable."
  );
}

// Nodemailer transporter setup for Gmail fallback
const createNodemailerTransporter = () => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.warn(
      "Nodemailer (Gmail) fallback is not fully configured. Please set GMAIL_USER and GMAIL_PASS environment variables."
    );
    return null;
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });
};

let nodemailerTransporter = createNodemailerTransporter();

// Function to send an email
// const sendEmail = async (
//   to,
//   subject,
//   textContent,
//   htmlContent,
//   attachments = []
// ) => {
//   const brevoFromEmail = process.env.BREVO_FROM_EMAIL || "noreply@aharraa.com"; // Default or configurable Brevo sender
//   const gmailFromEmail = process.env.GMAIL_USER || "info.aharraa@gmail.com";

//   // Try Nodemailer (Gmail) first
//   if (nodemailerTransporter && gmailFromEmail) {
//     try {
//       const mailOptions = {
//         from: gmailFromEmail,
//         to,
//         subject,
//         text: textContent,
//         html: htmlContent,
//         attachments: attachments.map(attachment => ({
//           content: attachment.content, // Nodemailer expects Buffer or string, not base64 string
//           filename: attachment.filename,
//           contentType: attachment.contentType,
//           cid: attachment.cid,
//         })),
//       };
//       await nodemailerTransporter.sendMail(mailOptions);
//       console.log(`Email sent via Nodemailer (Gmail) to ${to} with subject: ${subject}`);
//       return; // Email sent successfully via Nodemailer
//     } catch (nodemailerError) {
//       console.error(
//         `Error sending email via Nodemailer (Gmail) to ${to} with subject "${subject}":`,
//         nodemailerError
//       );
//       console.warn("Attempting to send email via Brevo fallback...");
//     }
//   } else {
//     console.warn(
//       "Nodemailer (Gmail) is not fully configured (missing GMAIL_USER or GMAIL_PASS). Attempting Brevo fallback..."
//     );
//   }

//   // Fallback to Brevo
//   if (process.env.BREVO_API_KEY) {
//     try {
//       const sendSmtpEmail = new SendSmtpEmail();
//       sendSmtpEmail.sender = { email: brevoFromEmail };
//       sendSmtpEmail.to = [{ email: to }];
//       sendSmtpEmail.subject = subject;
//       sendSmtpEmail.textContent = textContent;
//       sendSmtpEmail.htmlContent = htmlContent;

//       // Only add attachment field if there are attachments
//       if (attachments && attachments.length > 0) {
//         sendSmtpEmail.attachment = attachments.map((attachment) => ({
//           content: attachment.content.toString("base64"),
//           name: attachment.filename,
//         }));
//       }

//       await brevoEmailAPI.sendTransacEmail(sendSmtpEmail);
//       console.log(`Email sent via Brevo to ${to} with subject: ${subject}`);
//       return;
//     } catch (brevoError) {
//       console.error(
//         `Error sending email via Brevo to ${to} with subject "${subject}":`,
//         brevoError // Log the entire error object for detailed debugging
//       );
//       if (brevoError.response && brevoError.response.body) {
//         console.error("Brevo API Error Details:", brevoError.response.body);
//       }
//       throw new Error(`Failed to send email to ${to} via Brevo: ${brevoError.message}`);
//     }
//   } else {
//     throw new Error(`Failed to send email to ${to}: No configured email service could send the email.`);
//   }
// };

module.exports = {
  sendEmail,
};
