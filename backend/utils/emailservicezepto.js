// services/emailService.js
// @ts-ignore
const { SendMailClient } = require('zeptomail');

const url = "https://api.zeptomail.com/";
const token = "Zoho-enczapikey wSsVR61++EalCP18njylL7hrygwBUgnwFkh421WjuXD4SquW88dtwRfNUAKnSPYfGDVsEGBGreohy00FgGUN2o8lzgoCDCiF9mqRe1U4J3x17qnvhDzJW2RUmxeIKY0AwwtrkmNoFcwr+g==";
const zepto = new SendMailClient({url, token});

async function sendEmail(to, subject, htmlBody) {
  try {
    const response = await zepto.sendMail({
      from: {
        address: "info@dashdoxs.com",
        name: "DashDoxs"
      },
      to: [
        {
          email_address: {
            address: to
          }
        }
      ],
      subject: subject,
      htmlbody: htmlBody
    });

    console.log("Email sent:", response);
    return response;
  } catch (error) {
    console.error("Email sending failed:", error);
    throw error;
  }
}

module.exports = {
  sendEmail
};