const getUserOrderConfirmationEmail = (order, user, invoicePdfUrl = null) => {
  let itemsHtml = '';
  order.items.forEach(item => {
    itemsHtml += `
      <div style="border:2px solid #034C3C; margin:0 0 2px 0; padding:14px; background:#fff;">
        <div style="font-family:monospace; font-size:11px; color:#666; margin-bottom:8px;">ITEM_${order.items.indexOf(item) + 1}</div>
        <div style="font-size:16px; font-weight:700; color:#000; text-transform:uppercase; margin-bottom:4px;">${item.menu.name}</div>
        <div style="font-size:13px; color:#000; margin-bottom:10px;">${item.plan.name} / ${item.vendor.name}</div>
        <div style="display:flex; gap:30px; flex-wrap:wrap; border-top:1px solid #000; padding-top:10px; margin-top:10px;">
          <div><span style="font-size:11px; color:#666;">QTY:</span> <span style="font-size:14px; font-weight:700;">${item.quantity}</span></div>
          <div><span style="font-size:11px; color:#666;">PRICE:</span> <span style="font-size:14px; font-weight:700;">₹${item.itemTotalPrice}</span></div>
        </div>
        ${item.personDetails && item.personDetails.length > 0 ? `
        <div style="background:#034C3C; color:#fff; padding:10px; margin-top:10px;">
          ${item.personDetails.map(p => `<div style="font-size:12px; margin:3px 0;">${p.name} / ${p.phoneNumber}</div>`).join('')}
        </div>` : ''}
        <div style="font-size:11px; color:#000; margin-top:10px; font-family:monospace;">
          ${new Date(item.startDate).toLocaleDateString()} → ${new Date(item.endDate).toLocaleDateString()}
        </div>
      </div>
    `;
  });

  const invoiceLinkHtml = invoicePdfUrl ? `
    <div style="margin-top: 20px; text-align: center;">
      <a href="${invoicePdfUrl}" style="background-color: #034C3C; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Download Invoice PDF</a>
    </div>
  ` : '';

  const userTextContent = `
    Order Confirmation - Aharraa
    Order #${order._id} - CONFIRMED

    USER: ${(user.name || user.fullname || user.email).toUpperCase()}

    TOTAL AMOUNT: ₹${order.totalAmount}

    ORDER ITEMS:
    ${order.items.map((item, index) => `
      ITEM_${index + 1}: ${item.menu.name}
      Plan: ${item.plan.name} / Vendor: ${item.vendor.name}
      Quantity: ${item.quantity}
      Price: ₹${item.itemTotalPrice}
      ${item.personDetails && item.personDetails.length > 0 ? `Persons: ${item.personDetails.map(p => `${p.name} / ${p.phoneNumber}`).join(', ')}` : ''}
      Dates: ${new Date(item.startDate).toLocaleDateString()} -> ${new Date(item.endDate).toLocaleDateString()}
    `).join('\n')}

    ORDER DATA:
    PAYMENT: ${order.paymentMethod}
    STATUS: ${order.status}
    DATE: ${new Date(order.orderDate).toLocaleDateString()}
    CURRENCY: ${order.currency}

    DELIVERY ADDRESS:
    ${Array.from(order.deliveryAddresses || new Map()).map(([category, address]) => {
        const plainAddress = address.toObject ? address.toObject() : address;
        if (plainAddress && plainAddress.street && plainAddress.city && plainAddress.zip) {
            return `${category}: ${plainAddress.street}, ${plainAddress.city}, ${plainAddress.zip}`;
        }
        return '';
    }).filter(Boolean).join('\n')}

    ${invoicePdfUrl ? `Invoice PDF: ${invoicePdfUrl}` : ''}

    CREATED: ${new Date(order.createdAt).toLocaleString()}
    UPDATED: ${new Date(order.updatedAt).toLocaleString()}

    AHARRAA_${new Date().getFullYear()} - DEVELOPED BY HYNOX
  `;

  return {
    text: userTextContent,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0; padding:0; background:#e0e0e0; font-family:Arial,sans-serif;">
        <div style="max-width:600px; margin:0 auto; padding:0;">
          
          <div style="background:#034C3C; color:#fff; padding:24px; border:4px solid #034C3C;">
            <div style="font-family:monospace; font-size:12px; margin-bottom:4px;">ORDER_CONFIRMATION</div>
            <div style="font-size:32px; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">CONFIRMED</div>
            <div style="font-family:monospace; font-size:13px; margin-top:8px;">#${order._id}</div>
          </div>

          <div style="background:#fff; border:4px solid #034C3C; border-top:none; padding:24px;">
            
            <div style="margin-bottom:20px;">
              <div style="font-size:14px; color:#000;">USER: ${(user.name || user.fullname || user.email).toUpperCase()}</div>
            </div>

            <div style="background:#034C3C; color:#fff; padding:16px; margin:20px 0; text-align:center;">
              <div style="font-size:12px; margin-bottom:4px;">TOTAL_AMOUNT</div>
              <div style="font-size:36px; font-weight:900;">₹${order.totalAmount}</div>
            </div>

            <div style="font-family:monospace; font-size:11px; color:#666; margin:20px 0 10px 0;">ORDER_ITEMS</div>
            ${itemsHtml}

            ${invoiceLinkHtml}

            <div style="border:2px solid #000; padding:16px; margin:20px 0;">
              <div style="font-family:monospace; font-size:11px; color:#666; margin-bottom:12px;">ORDER_DATA</div>
              <div style="font-size:13px; line-height:2;">
                <div><span style="font-weight:700;">PAYMENT:</span> ${order.paymentMethod}</div>
                <div><span style="font-weight:700;">STATUS:</span> ${order.status}</div>
                <div><span style="font-weight:700;">DATE:</span> ${new Date(order.orderDate).toLocaleDateString()}</div>
                <div><span style="font-weight:700;">CURRENCY:</span> ${order.currency}</div>
              </div>
            </div>

            <div style="border:2px solid #000; padding:16px; margin:20px 0;">
              <div style="font-family:monospace; font-size:11px; color:#666; margin-bottom:12px;">DELIVERY_ADDRESS</div>
              ${Array.from(order.deliveryAddresses || new Map()).map(([category, address]) => {
                  const plainAddress = address.toObject ? address.toObject() : address;
                  if (plainAddress && plainAddress.street && plainAddress.city && plainAddress.zip) {
                      return `<div style="font-size:13px; margin-bottom:8px;">
                        <div style="font-weight:700; text-transform:uppercase;">${category}</div>
                        <div>${plainAddress.street}, ${plainAddress.city}, ${plainAddress.zip}</div>
                      </div>`;
                  }
                  return '';
              }).join('')}
            </div>

            <div style="font-size:11px; font-family:monospace; color:#666; margin-top:24px; line-height:1.8;">
              CREATED: ${new Date(order.createdAt).toLocaleString()}<br>
              UPDATED: ${new Date(order.updatedAt).toLocaleString()}
            </div>

          </div>

          <div style="background:#034C3C; color:#fff; padding:20px; text-align:center; border:4px solid #034C3C; border-top:none;">
            <div style="font-size:11px; font-family:monospace;">AHARRAA_${new Date().getFullYear()}</div>
            <div style="font-size:11px; font-family:monospace;">POWERED BY HYNOX</div>
          </div>

        </div>
      </body>
      </html>
    `,
  };
};

const getVendorOrderNotificationEmail = (order, vendor, vendorItems) => {
  let itemsHtml = '';
  vendorItems.forEach(item => {
    itemsHtml += `
      <div style="border:2px solid #034C3C; margin:0 0 2px 0; padding:14px; background:#fff;">
        <div style="font-family:monospace; font-size:11px; color:#666; margin-bottom:8px;">ITEM_${vendorItems.indexOf(item) + 1}</div>
        <div style="font-size:16px; font-weight:700; color:#000; text-transform:uppercase; margin-bottom:4px;">${item.menu.name}</div>
        <div style="font-size:13px; color:#000; margin-bottom:10px;">${item.plan.name}</div>
        <div style="display:flex; gap:30px; flex-wrap:wrap; border-top:1px solid #000; padding-top:10px; margin-top:10px;">
          <div><span style="font-size:11px; color:#666;">QTY:</span> <span style="font-size:14px; font-weight:700;">${item.quantity}</span></div>
          <div><span style="font-size:11px; color:#666;">PRICE:</span> <span style="font-size:14px; font-weight:700;">₹${item.itemTotalPrice}</span></div>
        </div>
        ${item.personDetails && item.personDetails.length > 0 ? `
        <div style="background:#034C3C; color:#fff; padding:10px; margin-top:10px;">
          ${item.personDetails.map(p => `<div style="font-size:12px; margin:3px 0;">${p.name} / ${p.phoneNumber}</div>`).join('')}
        </div>` : ''}
        <div style="font-size:11px; color:#000; margin-top:10px; font-family:monospace;">
          ${new Date(item.startDate).toLocaleDateString()} → ${new Date(item.endDate).toLocaleDateString()}
        </div>
      </div>
    `;
  });

  const vendorTextContent = `
    New Order Notification - Aharraa
    Order #${order._id} - ACTION REQUIRED

    KITCHEN: ${vendor.name.toUpperCase()}

    ORDER VALUE: ₹${order.totalAmount}

    YOUR ITEMS:
    ${vendorItems.map((item, index) => `
      ITEM_${index + 1}: ${item.menu.name}
      Plan: ${item.plan.name}
      Quantity: ${item.quantity}
      Price: ₹${item.itemTotalPrice}
      ${item.personDetails && item.personDetails.length > 0 ? `Persons: ${item.personDetails.map(p => `${p.name} / ${p.phoneNumber}`).join(', ')}` : ''}
      Dates: ${new Date(item.startDate).toLocaleDateString()} -> ${new Date(item.endDate).toLocaleDateString()}
    `).join('\n')}

    CUSTOMER:
    ${order.user.name || 'N/A'}
    ${order.user.email || 'N/A'}

    ORDER INFO:
    PAYMENT: ${order.paymentMethod}
    STATUS: ${order.status}
    DATE: ${new Date(order.orderDate).toLocaleDateString()}

    DELIVERY ADDRESS:
    ${Array.from(order.deliveryAddresses || new Map()).map(([category, address]) => {
        const plainAddress = address.toObject ? address.toObject() : address;
        if (plainAddress && plainAddress.street && plainAddress.city && plainAddress.zip) {
            return `${category}: ${plainAddress.street}, ${plainAddress.city}, ${plainAddress.zip}`;
        }
        return '';
    }).filter(Boolean).join('\n')}

    CREATED: ${new Date(order.createdAt).toLocaleString()}
    UPDATED: ${new Date(order.updatedAt).toLocaleString()}

    AHARRAA_${new Date().getFullYear()} - DEVELOPED BY HYNOX
  `;

  return {
    text: vendorTextContent,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0; padding:0; background:#e0e0e0; font-family:Arial,sans-serif;">
        <div style="max-width:600px; margin:0 auto; padding:0;">
          
          <div style="background:#034C3C; color:#fff; padding:24px; border:4px solid #034C3C;">
            <div style="background:#fff; color:#000; display:inline-block; padding:4px 12px; font-size:11px; font-weight:700; margin-bottom:12px;">NEW_ORDER</div>
            <div style="font-size:32px; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">ACTION REQUIRED</div>
            <div style="font-family:monospace; font-size:13px; margin-top:8px;">#${order._id}</div>
          </div>

          <div style="background:#fff; border:4px solid #034C3C; border-top:none; padding:24px;">
            
            <div style="margin-bottom:20px;">
              <div style="font-size:14px; color:#000;">KITCHEN: ${vendor.name.toUpperCase()}</div>
            </div>

            <div style="background:#034C3C; color:#fff; padding:16px; margin:20px 0; text-align:center;">
              <div style="font-size:12px; margin-bottom:4px;">ORDER_VALUE</div>
              <div style="font-size:36px; font-weight:900;">₹${order.totalAmount}</div>
            </div>

            <div style="font-family:monospace; font-size:11px; color:#666; margin:20px 0 10px 0;">YOUR_ITEMS</div>
            ${itemsHtml}

            <div style="border:2px solid #000; padding:16px; margin:20px 0; background:#f5f5f5;">
              <div style="font-family:monospace; font-size:11px; color:#666; margin-bottom:12px;">CUSTOMER</div>
              <div style="font-size:14px; font-weight:700;">${order.user.name || 'N/A'}</div>
              <div style="font-size:13px; margin-top:4px;">${order.user.email || 'N/A'}</div>
            </div>

            <div style="border:2px solid #000; padding:16px; margin:20px 0;">
              <div style="font-family:monospace; font-size:11px; color:#666; margin-bottom:12px;">ORDER_INFO</div>
              <div style="font-size:13px; line-height:2;">
                <div><span style="font-weight:700;">PAYMENT:</span> ${order.paymentMethod}</div>
                <div><span style="font-weight:700;">STATUS:</span> ${order.status}</div>
                <div><span style="font-weight:700;">DATE:</span> ${new Date(order.orderDate).toLocaleDateString()}</div>
              </div>
            </div>

            <div style="border:2px solid #000; padding:16px; margin:20px 0;">
              <div style="font-family:monospace; font-size:11px; color:#666; margin-bottom:12px;">DELIVERY_ADDRESS</div>
              ${Array.from(order.deliveryAddresses || new Map()).map(([category, address]) => {
                  const plainAddress = address.toObject ? address.toObject() : address;
                  if (plainAddress && plainAddress.street && plainAddress.city && plainAddress.zip) {
                      return `<div style="font-size:13px; margin-bottom:8px;">
                        <div style="font-weight:700; text-transform:uppercase;">${category}</div>
                        <div>${plainAddress.street}, ${plainAddress.city}, ${plainAddress.zip}</div>
                      </div>`;
                  }
                  return '';
              }).join('')}
            </div>

            <div style="font-size:11px; font-family:monospace; color:#666; margin-top:24px; line-height:1.8;">
              CREATED: ${new Date(order.createdAt).toLocaleString()}<br>
              UPDATED: ${new Date(order.updatedAt).toLocaleString()}
            </div>

          </div>

          <div style="background:#034C3C; color:#fff; padding:20px; text-align:center; border:4px solid #034C3C; border-top:none;">
            <div style="font-size:11px; font-family:monospace;">AHARRAA_${new Date().getFullYear()}</div>
            <div style="font-size:11px; font-family:monospacce;">POWERED BY HYNOX</div>
          </div>

        </div>
      </body>
      </html>
    `,
  };
};


module.exports = {
  getUserOrderConfirmationEmail,
  getVendorOrderNotificationEmail,
};
