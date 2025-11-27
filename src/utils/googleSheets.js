const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function getGoogleSheetClient() {
  let auth;
  if (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
    // Use credentials from environment variables for production
    auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure newlines are correctly interpreted
      },
      scopes: SCOPES,
    });
  } else {
    // Fallback for local development if environment variables are not set
    // Path to your service account key file
    const KEYFILEPATH = './service_account_credentials.json'; // TODO: Update with actual path for local dev
    auth = new google.auth.GoogleAuth({
      keyFile: KEYFILEPATH,
      scopes: SCOPES,
    });
  }

  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

module.exports = {
  getGoogleSheetClient,
};
