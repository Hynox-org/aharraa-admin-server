const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
const { supabaseServiceRole } = require("../config/supabase");

const {
  calculateDeliveryCost,
  calculatePlatformCost,
  calculateGstCost,
  calculateGrandTotal,
} = require("./pricingCalculations");

const generateInvoicePdf = async (order, user) => {
  let browser;
  if (process.env.SERVER_ENVIRONMENT === "production") {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: "new",
      ignoreHTTPSErrors: true,
      userDataDir: "/tmp",
    });
  } else {
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      (process.platform === "win32" &&
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe") ||
      (process.platform === "darwin" &&
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ||
      (process.platform === "linux" && "/usr/bin/google-chrome");

    if (!executablePath) {
      console.error(
        "No Chrome/Chromium executable found. Please install Chrome or set PUPPETEER_EXECUTABLE_PATH environment variable."
      );
      throw new Error(
        "No Chrome/Chromium executable found for development environment."
      );
    }

    browser = await puppeteer.launch({
      executablePath: executablePath,
      headless: "new",
      ignoreHTTPSErrors: true,
    });
  }
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(0);

  const orderDate = new Date(order.orderDate).toLocaleDateString("en-IN");

  // Calculate subtotal from items
  const subtotal = order.items.reduce(
    (sum, item) => sum + item.itemTotalPrice,
    0
  );

  // Calculate costs
  const deliveryCostPerMealPerDay = 33; // Renamed for consistency with frontend
  const deliveryCost = calculateDeliveryCost(
    order.items, // Pass the entire items array
    deliveryCostPerMealPerDay
  );
  const platformCost = calculatePlatformCost(subtotal);
  const gstCost = calculateGstCost(subtotal);
  const grandTotal = calculateGrandTotal({
    subtotal,
    deliveryCost,
    platformCost,
    gstCost,
    environment: process.env.SERVER_ENVIRONMENT, // Pass environment to the centralized function
  });

  // Generate items HTML
  const itemsHtml = order.items
    .map((item, index) => {
      const unitPrice = item.itemTotalPrice / item.quantity;
      const startDate = new Date(item.startDate).toLocaleDateString("en-IN");
      const endDate = new Date(item.endDate).toLocaleDateString("en-IN");

      return `
      <tr>
        <td class="item-number">${index + 1}</td>
        <td class="item-details">
          <div class="meal-name">${item.menu.name}</div>
          <div class="item-meta">
            <span class="meta-badge plan-badge">${item.plan.name}</span>
            <span class="meta-badge date-badge">${startDate} - ${endDate}</span>
          </div>
          <div class="vendor-name">🏪 ${item.vendor.name}</div>
        </td>
        <td class="text-center qty-cell">${item.quantity}</td>
        <td class="text-right">₹${unitPrice.toFixed(2)}</td>
        <td class="text-right amount-cell">₹${item.itemTotalPrice.toFixed(
          2
        )}</td>
      </tr>
    `;
    })
    .join("");

  const htmlContent = `
    <!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${order._id}</title>
  <style>
    * { 
      margin: 0; 
      padding: 0; 
      box-sizing: border-box; 
    }
    
    body { 
      font-family: 'Arial', 'Helvetica', sans-serif;
      color: #333;
      line-height: 1.5;
      background: #fff;
      padding: 40px 20px;
    }
    
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #ddd;
    }
    
    .invoice-header {
      padding: 30px;
      border-bottom: 3px solid #000;
    }
    
    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    
    .logo-section .logo {
      width: 140px;
      height: auto;
    }
    
    .invoice-title-section {
      text-align: right;
    }
    
    .invoice-label {
      font-size: 28px;
      font-weight: bold;
      color: #000;
      margin-bottom: 8px;
    }
    
    .invoice-number {
      font-size: 14px;
      color: #666;
      margin-bottom: 4px;
    }
    
    .invoice-date {
      font-size: 13px;
      color: #666;
      margin-bottom: 8px;
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      border: 1px solid #000;
      color: #000;
    }
    
    .invoice-body {
      padding: 30px;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid #ddd;
    }
    
    .info-block h3 {
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      color: #000;
    }
    
    .info-block p {
      font-size: 13px;
      color: #333;
      margin: 4px 0;
      line-height: 1.6;
    }
    
    .info-block p strong {
      font-weight: bold;
      color: #000;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #000;
      color: #000;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
      border: 1px solid #ddd;
    }
    
    th {
      background: #f5f5f5;
      color: #000;
      font-weight: bold;
      padding: 12px 10px;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      border-bottom: 1px solid #ddd;
    }
    
    td {
      padding: 12px 10px;
      border-bottom: 1px solid #eee;
      font-size: 13px;
      vertical-align: top;
      color: #333;
    }
    
    tbody tr:last-child td {
      border-bottom: none;
    }
    
    .item-number {
      color: #666;
      font-weight: bold;
      width: 40px;
    }
    
    .meal-name {
      font-weight: bold;
      color: #000;
      font-size: 13px;
      margin-bottom: 6px;
    }
    
    .item-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 4px;
    }
    
    .meta-badge {
      font-size: 10px;
      padding: 2px 8px;
      border: 1px solid #ddd;
      font-weight: normal;
      color: #666;
    }
    
    .vendor-name {
      font-size: 11px;
      color: #666;
      margin-top: 4px;
    }
    
    .text-center {
      text-align: center;
    }
    
    .text-right {
      text-align: right;
    }
    
    .qty-cell {
      font-weight: bold;
    }
    
    .amount-cell {
      font-weight: bold;
      color: #000;
    }
    
    .summary-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
    }
    
    .summary-box {
      width: 320px;
      border: 1px solid #ddd;
    }
    
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 15px;
      font-size: 13px;
      border-bottom: 1px solid #eee;
    }
    
    .summary-row:last-child {
      border-bottom: none;
    }
    
    .summary-row.subtotal-row {
      font-weight: bold;
      border-top: 2px solid #ddd;
    }
    
    .summary-row.total-row {
      background: #f5f5f5;
      font-size: 15px;
      font-weight: bold;
      padding: 12px 15px;
      border-top: 2px solid #000;
    }
    
    .summary-label {
      color: #333;
    }
    
    .summary-value {
      font-weight: bold;
      color: #000;
    }
    
    .info-card {
      padding: 15px;
      margin-top: 20px;
      border: 1px solid #ddd;
      background: #fafafa;
    }
    
    .info-card h3 {
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      color: #000;
    }
    
    .info-card p {
      font-size: 13px;
      color: #333;
      margin: 6px 0;
      line-height: 1.5;
    }
    
    .info-card p strong {
      font-weight: bold;
      color: #000;
    }
    
    .footer {
      margin-top: 30px;
      padding: 20px 30px;
      text-align: center;
      border-top: 2px solid #ddd;
      background: #fafafa;
    }
    
    .footer-title {
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 6px;
      color: #000;
    }
    
    .footer p {
      color: #666;
      font-size: 12px;
      margin: 4px 0;
    }
    
    .footer-note {
      font-size: 11px;
      color: #999;
      margin-top: 12px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="invoice-header">
      <div class="header-content">
        <div class="logo-section">
          <img src="https://qlgusdrybvqzckgizmco.supabase.co/storage/v1/object/public/Files/aharra_logo_color.jpg" alt="Aharra Logo" class="logo">
        </div>
        <div class="invoice-title-section">
          <div class="invoice-label">INVOICE</div>
          <div class="invoice-number">#${order._id
            .toString()
            .slice(-8)
            .toUpperCase()}</div>
          <div class="invoice-date">Date: ${orderDate}</div>
          <div class="status-badge">${order.status}</div>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div class="invoice-body">
      <!-- Info Grid -->
      <div class="info-grid">
        <div class="info-block">
          <h3>Bill To</h3>
          <p><strong>${
            user.fullName || user.metadata?.full_name || "N/A"
          }</strong></p>
          <p>${user.email}</p>
          <p>${user.phoneNumber || "N/A"}</p>
          ${
            user.breakfastDeliveryLocation
              ? `
            <p>${user.breakfastDeliveryLocation.street || ""}</p>
            <p>${user.breakfastDeliveryLocation.state || ""} - ${
                  user.breakfastDeliveryLocation.pincode || ""
                }</p>
          `
              : ""
          }
        </div>
        <div class="info-block">
          <h3>Order Details</h3>
          <p><strong>Order ID:</strong> ${order._id}</p>
          <p><strong>Order Date:</strong> ${orderDate}</p>
          <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
          ${
            order.paymentConfirmedAt
              ? `<p><strong>Paid On:</strong> ${new Date(
                  order.paymentConfirmedAt
                ).toLocaleDateString("en-IN")}</p>`
              : ""
          }
        </div>
      </div>

      <!-- Order Items -->
      <h2 class="section-title">Order Items</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 5%;">#</th>
            <th style="width: 45%;">Description</th>
            <th style="width: 12%; text-align: center;">Qty</th>
            <th style="width: 18%; text-align: right;">Unit Price</th>
            <th style="width: 20%; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Summary -->
      <div class="summary-wrapper">
        <div class="summary-box">
          <div class="summary-row subtotal-row">
            <span class="summary-label">Subtotal</span>
            <span class="summary-value">₹${subtotal.toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Delivery Charges</span>
            <span class="summary-value">₹${deliveryCost.toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Platform Fee (10%)</span>
            <span class="summary-value">₹${platformCost.toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">GST (5%)</span>
            <span class="summary-value">₹${gstCost.toFixed(2)}</span>
          </div>
          <div class="summary-row total-row">
            <span class="summary-label">TOTAL</span>
            <span class="summary-value">₹${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <!-- Payment Info -->
      <div class="info-card">
        <h3>Payment Information</h3>
        <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
        <p><strong>Amount Paid:</strong> ₹${order.totalAmount.toFixed(2)}</p>
        <p><strong>Currency:</strong> ${order.currency}</p>
      </div>

      <!-- Delivery Addresses -->
      ${
        order.deliveryAddresses &&
        Object.keys(order.deliveryAddresses).length > 0
          ? `
        <div class="info-card">
          <h3>Delivery Addresses</h3>
          ${Array.from(order.deliveryAddresses || new Map())
            .map(([category, address]) => {
              const plainAddress = address.toObject
                ? address.toObject()
                : address;
              if (
                plainAddress &&
                plainAddress.street &&
                plainAddress.city &&
                plainAddress.zip
              ) {
                return `<p><strong>${category}:</strong> ${plainAddress.street}, ${plainAddress.city}, ${plainAddress.zip}</p>`;
              }
              return "";
            })
            .filter(Boolean)
            .join("")}
        </div>
      `
          : ""
      }
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="footer-title">Thank you for your order!</p>
      <p>For any queries, please contact us at support@aharra.com</p>
      <p class="footer-note">This is a computer-generated invoice and does not require a signature.</p>
      <p>Powered by HYNOX</p>
    </div>
  </div>
</body>
</html>
  `;

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "20px",
      right: "20px",
      bottom: "20px",
      left: "20px",
    },
  });

  await browser.close();

  // Upload to Supabase
  const fileName = `invoice-${order._id}.pdf`;
  const { data: listData, error: listError } = await supabaseServiceRole.storage
    .from("AharraaInvoices")
    .list("", { search: fileName });

  let publicUrl;

  if (listError) {
    console.error("Error listing files in Supabase:", listError);
    throw new Error("Failed to check for existing invoice PDF.");
  }

  const { data, error } = await supabaseServiceRole.storage
    .from("AharraaInvoices")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    console.error("Error uploading PDF to Supabase:", error);
    throw new Error("Failed to upload invoice PDF.");
  }

  const { data: publicUrlData } = supabaseServiceRole.storage
    .from("AharraaInvoices")
    .getPublicUrl(fileName);
  publicUrl = publicUrlData.publicUrl;

  return `${publicUrl}?v=${new Date().getTime()}`;
};

module.exports = {
  generateInvoicePdf,
};
