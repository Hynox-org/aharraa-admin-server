const { default: fetch } = require("node-fetch");

const createCashfreeOrder = async (orderId, orderAmount, customerDetails) => {
  let cashfreeBaseUrl;
  if (process.env.NODE_ENV === "production") {
    cashfreeBaseUrl = "https://api.cashfree.com";
  } else {
    cashfreeBaseUrl = "https://sandbox.cashfree.com";
  }

  const url = process.env.CASHFREE_API_URL || `${cashfreeBaseUrl}/pg/orders`;
  const xApiVersion = process.env.CASHFREE_API_VERSION || "2025-01-01";
  const xClientId = process.env.CASHFREE_CLIENT_ID;
  const xClientSecret = process.env.CASHFREE_CLIENT_SECRET;

  if (!xClientId || !xClientSecret) {
    throw new Error("Cashfree API keys are not configured.");
  }

  const options = {
    method: "POST",
    headers: {
      "x-api-version": xApiVersion,
      "x-client-id": xClientId,
      "x-client-secret": xClientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: "INR",
      customer_details: customerDetails,
      order_meta: {
        return_url: `${process.env.NEXT_FRONTEND_BASE_URL}/order-status/${orderId}`,
        notify_url: `${process.env.BACKEND_BASE_URL}/api/orders/webhook`,
      },
      payment_methods_filters: {
        methods: {
          action: "ALLOW",
          values: ["credit_card", "debit_card", "upi"],
        },
      },
    }),
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      return data;
    } else {
      throw new Error(`Cashfree API error: ${data.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error creating Cashfree order:", error);
    throw error;
  }
};

const getCashfreeOrderDetails = async (orderId) => {
  let cashfreeBaseUrl;
  if (process.env.NODE_ENV === "production") {
    cashfreeBaseUrl = "https://api.cashfree.com";
  } else {
    cashfreeBaseUrl = "https://sandbox.cashfree.com";
  }

  const url = `${cashfreeBaseUrl}/pg/orders/${orderId}`;
  const xApiVersion = process.env.CASHFREE_API_VERSION || "2025-01-01";
  const xClientId = process.env.CASHFREE_CLIENT_ID;
  const xClientSecret = process.env.CASHFREE_CLIENT_SECRET;

  if (!xClientId || !xClientSecret) {
    throw new Error("Cashfree API keys are not configured.");
  }

  const options = {
    method: "GET",
    headers: {
      "x-api-version": xApiVersion,
      "x-client-id": xClientId,
      "x-client-secret": xClientSecret,
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      return data;
    } else {
      throw new Error(`Cashfree API error: ${data.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error fetching Cashfree order details:", error);
    throw error;
  }
};

const initiateCashfreeRefund = async (
  orderId,
  refundAmount,
  refundId,
  refundNote,
  refundSpeed = "STANDARD"
) => {
  let cashfreeBaseUrl;
  if (process.env.NODE_ENV === "production") {
    cashfreeBaseUrl = "https://api.cashfree.com";
  } else {
    cashfreeBaseUrl = "https://sandbox.cashfree.com";
  }

  const url = `${cashfreeBaseUrl}/pg/orders/${orderId}/refunds`;
  const xApiVersion = process.env.CASHFREE_API_VERSION || "2025-01-01";
  const xClientId = process.env.CASHFREE_CLIENT_ID;
  const xClientSecret = process.env.CASHFREE_CLIENT_SECRET;

  if (!xClientId || !xClientSecret) {
    throw new Error("Cashfree API keys are not configured.");
  }

  const options = {
    method: "POST",
    headers: {
      "x-api-version": xApiVersion,
      "x-client-id": xClientId,
      "x-client-secret": xClientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refund_amount: refundAmount,
      refund_id: refundId,
      refund_note: refundNote,
      refund_speed: refundSpeed,
    }),
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      return data;
    } else {
      console.error("Cashfree refund initiation failed:", data);
      throw new Error(`Cashfree API error: ${data.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error initiating Cashfree refund:", error);
    throw error;
  }
};

const getCashfreeRefundDetails = async (orderId, refundId) => {
  let cashfreeBaseUrl;
  if (process.env.NODE_ENV === "production") {
    cashfreeBaseUrl = "https://api.cashfree.com";
  } else {
    cashfreeBaseUrl = "https://sandbox.cashfree.com";
  }

  const url = `${cashfreeBaseUrl}/pg/orders/${orderId}/refunds/${refundId}`;
  const xApiVersion = process.env.CASHFREE_API_VERSION || "2025-01-01";
  const xClientId = process.env.CASHFREE_CLIENT_ID;
  const xClientSecret = process.env.CASHFREE_CLIENT_SECRET;

  if (!xClientId || !xClientSecret) {
    throw new Error("Cashfree API keys are not configured.");
  }

  const options = {
    method: "GET",
    headers: {
      "x-api-version": xApiVersion,
      "x-client-id": xClientId,
      "x-client-secret": xClientSecret,
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      return data;
    } else {
      throw new Error(`Cashfree API error: ${data.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error fetching Cashfree refund details:", error);
    throw error;
  }
};

const getAllCashfreeRefundsForOrder = async (orderId) => {
  let cashfreeBaseUrl;
  if (process.env.NODE_ENV === "production") {
    cashfreeBaseUrl = "https://api.cashfree.com";
  } else {
    cashfreeBaseUrl = "https://sandbox.cashfree.com";
  }

  const url = `${cashfreeBaseUrl}/pg/orders/${orderId}/refunds`;
  const xApiVersion = process.env.CASHFREE_API_VERSION || "2025-01-01";
  const xClientId = process.env.CASHFREE_CLIENT_ID;
  const xClientSecret = process.env.CASHFREE_CLIENT_SECRET;

  if (!xClientId || !xClientSecret) {
    throw new Error("Cashfree API keys are not configured.");
  }

  const options = {
    method: "GET",
    headers: {
      "x-api-version": xApiVersion,
      "x-client-id": xClientId,
      "x-client-secret": xClientSecret,
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      // ✅ Return data as-is (can be array or object with array)
      return data || [];
    } else {
      throw new Error(`Cashfree API error: ${data.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error fetching all Cashfree refunds for order:", error);
    throw error;
  }
};

const updateCashfreeRefund = async (
  orderId,
  refundId,
  newRefundStatus,
  remarks
) => {
  let cashfreeBaseUrl;
  if (process.env.NODE_ENV === "production") {
    cashfreeBaseUrl = "https://api.cashfree.com";
  } else {
    cashfreeBaseUrl = "https://sandbox.cashfree.com";
  }

  const url = `${cashfreeBaseUrl}/pg/orders/${orderId}/refunds/${refundId}`;
  const xApiVersion = process.env.CASHFREE_API_VERSION || "2025-01-01";
  const xClientId = process.env.CASHFREE_CLIENT_ID;
  const xClientSecret = process.env.CASHFREE_CLIENT_SECRET;

  if (!xClientId || !xClientSecret) {
    throw new Error("Cashfree API keys are not configured.");
  }

  const options = {
    method: "PUT",
    headers: {
      "x-api-version": xApiVersion,
      "x-client-id": xClientId,
      "x-client-secret": xClientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refund_status: newRefundStatus,
      remarks: remarks,
    }),
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      return data;
    } else {
      throw new Error(`Cashfree API error: ${data.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error updating Cashfree refund:", error);
    throw error;
  }
};

// ✅ CRITICAL: Single export statement at the end
module.exports = {
  createCashfreeOrder,
  getCashfreeOrderDetails,
  initiateCashfreeRefund,
  getCashfreeRefundDetails,
  getAllCashfreeRefundsForOrder,
  updateCashfreeRefund,
};
