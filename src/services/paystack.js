import { supabase } from "../config/supabase";

// Paystack configuration
const PAYSTACK_PUBLIC_KEY = "pk_test_7d6bef2c11764ac43547031baf2c197607286987";
const SUPABASE_EDGE_FUNCTION_URL =
  "https://qxxflbymaoledpluzqtb.supabase.co/functions/v1/initialize-payment"; // Base URL for edge functions

/**
 * Initialize Paystack payment via Edge Function (secure, split-aware)
 * @param {object} params
 * @param {string} params.reference - Unique payment reference
 * @param {object} params.orderData - Checkout details used by backend validation
 * @param {number} [params.amount] - Optional amount for sanity validation
 * @returns {Promise<object>} - Payment initialization response
 */
export async function initializePaystackPayment({
  reference,
  orderData,
  amount,
} = {}) {
  try {
    // Get the current user's session for authorization
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("User not authenticated");
    }

    if (!reference) {
      throw new Error("Payment reference is required");
    }

    console.log("Initializing payment with server-side split flow", {
      reference,
      amount,
    });

    // Call Edge Function to initialize payment (secure with secret key on server)
    const response = await fetch(SUPABASE_EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        reference,
        orderData: orderData || {},
        amount,
      }),
    });

    console.log("Response status:", response.status);

    const data = await response.json();

    console.log("Edge Function response:", data);

    if (!response.ok) {
      throw new Error(
        data.error ||
          data.message ||
          `HTTP ${response.status}: Failed to initialize payment`,
      );
    }

    if (!data.success) {
      throw new Error(data.error || "Payment initialization failed");
    }

    // Validate response has required fields
    if (!data.reference || !data.authorizationUrl || !data.accessCode) {
      console.error("Invalid response structure:", data);
      throw new Error("Invalid response from payment service");
    }

    // Return the data directly from the Edge Function
    return {
      success: true,
      reference: data.reference,
      authorizationUrl: data.authorizationUrl,
      accessCode: data.accessCode,
      splitMode: data.splitMode,
      amount: data.amount,
    };
  } catch (error) {
    console.error("Paystack initialization error:", error);
    console.error("Error details:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Verify payment and create order via Supabase Edge Function
 * @param {string} reference - Paystack payment reference
 * @param {object} orderData - Order details
 * @returns {Promise<object>} - Order creation result
 */
export async function verifyPaymentAndCreateOrder(reference, orderData) {
  try {
    // Get current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error("Authentication required");
    }

    console.log("Verifying payment:", { reference, orderData });

    // Call Supabase Edge Function to verify payment and create order
    const verifyUrl =
      "https://qxxflbymaoledpluzqtb.supabase.co/functions/v1/verify-payment";

    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        reference,
        orderData,
      }),
    });

    const data = await response.json();

    console.log("Verification response:", data);

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Payment verification failed");
    }

    return data;
  } catch (error) {
    console.error("Payment verification error:", error);
    throw error;
  }
}

/**
 * Check payment status
 * @param {string} reference - Paystack payment reference
 * @returns {Promise<object>} - Payment status
 */
export async function checkPaymentStatus(reference) {
  try {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_PUBLIC_KEY}`,
        },
      },
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Failed to check payment status");
    }

    return {
      success: true,
      status: data.data.status,
      amount: data.data.amount / 100, // Convert from pesewas to cedis
      paidAt: data.data.paid_at,
      reference: data.data.reference,
    };
  } catch (error) {
    console.error("Payment status check error:", error);
    throw error;
  }
}

/**
 * Generate a unique payment reference
 * @returns {string} - Unique reference
 */
export function generatePaymentReference() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `CHAWP_${timestamp}_${random}`;
}

/**
 * Get Paystack public key for in-app payments
 * @returns {string} - Paystack public key
 */
export function getPaystackPublicKey() {
  return PAYSTACK_PUBLIC_KEY;
}
