const cron = require('node-cron');
const Order = require('../models/Order');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const { getGoogleSheetClient } = require('../utils/googleSheets');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID; // Google Sheet ID from environment variable
const SHEET_NAME = 'Orders'; // Default sheet name
const SHEET_RANGE = `${SHEET_NAME}!A:Z`; // Adjust range as needed
const LAST_SYNCED_CELL = `${SHEET_NAME}!B1`; // Assuming B1 is where "Last Synced" timestamp will be

// Define the expected header for the Google Sheet, including the Last Synced placeholder
const DEFAULT_HEADER = [
  'Order ID',
  'Last Synced', // Placeholder for the timestamp
  'User Email',
  'Total Amount',
  'Currency',
  'Order Date',
  'Status',
  'Payment Method',
  'Payment Status',
  'Created At',
  'Updated At',
  // Add more headers as needed to match the orderData array
];

async function syncOrdersToGoogleSheet() {
  const syncStartTime = new Date();
  syncStartTime.setHours(0, 0, 0, 0); // Set to 00:00 AM of the current day

  let totalOrders = 0;
  let updatedOrders = 0;
  let newOrders = 0;
  const failedUpdates = [];

  try {
    // 1. Fetch all current order records from the database as they exist at 00:00 AM.
    const orders = await Order.find({
      $or: [
        { orderDate: { $lte: syncStartTime } }, // Orders created before or at 00:00 AM
        { updatedAt: { $gte: syncStartTime } }  // Orders updated since 00:00 AM
      ]
    })
      .populate("user")
      .populate("items.menu")
      .populate("items.plan")
      .populate("items.vendor");

    totalOrders = orders.length;

    // 2. Authenticate with Google Sheets API
    const sheets = await getGoogleSheetClient();

    // 3. Check if the target sheet exists, if not, create it.
    let sheetExists = false;
    try {
      const sheetMetadata = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        ranges: [SHEET_RANGE],
        fields: 'sheets.properties',
      });
      sheetExists = sheetMetadata.data.sheets.some(s => s.properties.title === SHEET_NAME);
    } catch (error) {
      // If the spreadsheet itself doesn't exist or is inaccessible, this will throw.
      // For now, we assume the spreadsheet exists and focus on sheet existence.
      console.warn(`Could not retrieve sheet metadata for ${SHEET_NAME}. Assuming it might not exist or is inaccessible.`);
    }

    if (!sheetExists) {
      console.log(`Sheet "${SHEET_NAME}" not found. Creating it...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: SHEET_NAME,
              },
            },
          }],
        },
      });
      console.log(`Sheet "${SHEET_NAME}" created successfully.`);
      // After creating, we need to re-fetch values to get the new sheet's data (which will be empty)
    }

    // Now that we're sure the sheet exists, read its values
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE,
    });
    let existingRows = sheetResponse.data.values || [];
    console.log(`Fetched existingRows from sheet: ${JSON.stringify(existingRows)}`);
    let header = existingRows.length > 0 ? existingRows[0] : [];
    let dataRows = existingRows.slice(1);
    console.log(`Header: ${JSON.stringify(header)}`);
    console.log(`Data rows (after slicing header): ${JSON.stringify(dataRows)}`);

    // Check if header exists and matches the default header. If not, write the default header.
    if (existingRows.length === 0 || !arraysEqual(header, DEFAULT_HEADER)) {
      console.log('Google Sheet header is missing or incorrect. Writing default header.');
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1`, // Write header to the first row
        valueInputOption: 'RAW',
        resource: {
          values: [DEFAULT_HEADER],
        },
      });
      // Re-fetch or update local state to reflect the new header
      header = DEFAULT_HEADER;
      dataRows = []; // No data rows if we just wrote the header
      existingRows = [DEFAULT_HEADER]; // Update existingRows for consistency
    }

    const orderIdColumnIndex = header.indexOf('Order ID');
    if (orderIdColumnIndex === -1) {
      // This should ideally not happen after the header check, but as a safeguard
      throw new Error('Internal error: "Order ID" column not found after header initialization.');
    }

    // Prepare all order data to be written
    const allOrderData = orders.map(order => [
      order._id.toString(),
      '', // Placeholder for 'Last Synced' column in data rows, will be updated separately
      order.user ? order.user.email : 'N/A',
      order.totalAmount,
      order.currency,
      order.orderDate.toISOString(),
      order.status,
      order.paymentMethod,
      order.paymentDetails ? order.paymentDetails.status : 'N/A',
      order.createdAt.toISOString(),
      order.updatedAt.toISOString(),
      // Ensure this matches DEFAULT_HEADER
    ]);

    // Clear existing data rows (keep header)
    console.log(`Existing rows in sheet "${SHEET_NAME}" before clearing:`, existingRows.length);
    console.log(`Data rows (excluding header) in sheet "${SHEET_NAME}" before clearing:`, dataRows.length);

    if (dataRows.length > 0) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2:Z`, // Clear from row 2 onwards
      });
      console.log(`Cleared ${dataRows.length} existing data rows from sheet "${SHEET_NAME}".`);
    } else {
      console.log(`No data rows to clear in sheet "${SHEET_NAME}".`);
    }

    // Write all current orders to the sheet
    if (allOrderData.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2`, // Start appending from row 2 (after header)
        valueInputOption: 'RAW',
        resource: {
          values: allOrderData,
        },
      });
      newOrders = allOrderData.length; // All orders are "new" in this replacement strategy
      console.log(`Appended ${newOrders} orders to sheet "${SHEET_NAME}".`);
    }

    totalOrders = allOrderData.length; // Update totalOrders to reflect what was written
    updatedOrders = 0; // No individual updates in this strategy

    // Update "Last Synced" timestamp in the header
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: LAST_SYNCED_CELL,
      valueInputOption: 'RAW',
      resource: {
        values: [[`Last Synced: ${new Date().toLocaleString()}`]], // Update only the timestamp cell
      },
    });

    console.log(`Order synchronization completed: Total: ${totalOrders}, Updated: ${updatedOrders}, New: ${newOrders}`);
    return {
      status: "success",
      totalOrders: totalOrders,
      updatedOrders: updatedOrders,
      newOrders: newOrders,
      timestamp: new Date().toISOString(),
      failedUpdates: failedUpdates,
    };
  } catch (error) {
    console.error("Error during order synchronization:", error);
    failedUpdates.push({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return {
      status: "error",
      message: "Internal Server Error",
      timestamp: new Date().toISOString(),
      failedUpdates: failedUpdates,
    };
  }
}

// Helper function to compare arrays
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    // Special handling for 'Last Synced' column
    if (b[i] === 'Last Synced' && a[i].startsWith('Last Synced:')) {
      continue; // Consider it a match if it starts with 'Last Synced:'
    }
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function startOrderSyncCronJob() {
  // IMPORTANT: For production, use the daily schedule below.
  cron.schedule('0 0 * * *', async () => {
    console.log('Running scheduled order synchronization...');
    await syncOrdersToGoogleSheet();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // TODO: Adjust timezone as needed
  });
  console.log('Order synchronization cron job scheduled to run daily at 00:00 AM.');
}

module.exports = {
  syncOrdersToGoogleSheet,
  startOrderSyncCronJob,
};
