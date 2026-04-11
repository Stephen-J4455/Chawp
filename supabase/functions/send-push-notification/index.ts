// Supabase Edge Function to send push notifications via Expo Push API and Firebase Cloud Messaging V1 API
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PushResult = {
  token: string;
  success: boolean;
  messageId?: string;
  error?: string;
};

const EXPO_PUSH_REGEX = /^(ExponentPushToken|ExpoPushToken)\[/;

// Function to get OAuth2 access token from service account
async function getAccessToken(serviceAccount: any): Promise<string> {
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));

  const now = Math.floor(Date.now() / 1000);
  const jwtClaimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const jwtClaimSetEncoded = btoa(JSON.stringify(jwtClaimSet));

  const signatureInput = `${jwtHeader}.${jwtClaimSetEncoded}`;

  // Import private key
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Sign the JWT
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signatureInput),
  );

  const jwtSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const jwt = `${signatureInput}.${jwtSignature}`;

  // Exchange JWT for access token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await response.json();
  return tokenData.access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function sendExpoNotifications(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  sound: string,
): Promise<PushResult[]> {
  const results: PushResult[] = [];

  for (const tokenBatch of chunkArray(tokens, 100)) {
    const messages = tokenBatch.map((token) => ({
      to: token,
      sound,
      title,
      body,
      data,
      priority: "high",
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const payload = await response.json();
    const tickets = Array.isArray(payload?.data) ? payload.data : [];

    tokenBatch.forEach((token, index) => {
      const ticket = tickets[index];
      if (!response.ok) {
        results.push({
          token,
          success: false,
          error: payload?.errors?.[0]?.message || "Expo push request failed",
        });
        return;
      }

      if (ticket?.status === "ok") {
        results.push({
          token,
          success: true,
          messageId: ticket.id,
        });
        return;
      }

      results.push({
        token,
        success: false,
        error:
          ticket?.message ||
          ticket?.details?.error ||
          "Expo push ticket returned an error",
      });
    });
  }

  return results;
}

async function sendFcmNotification(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  sound: string,
  priority: string,
  accessToken: string,
  projectId: string,
): Promise<PushResult> {
  const message = {
    message: {
      token,
      notification: {
        title,
        body,
      },
      data,
      android: {
        priority: priority === "high" ? "high" : "normal",
        notification: {
          sound,
          channelId: data?.channelId || "default",
        },
      },
      apns: {
        headers: {
          "apns-priority": priority === "high" ? "10" : "5",
        },
        payload: {
          aps: {
            sound,
          },
        },
      },
    },
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    },
  );

  const result = await response.json();

  if (!response.ok) {
    return {
      token,
      success: false,
      error: result.error?.message || "Unknown FCM error",
    };
  }

  return {
    token,
    success: true,
    messageId: result.name,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tokens, title, body, data, sound = "default", priority = "high" } =
      await req.json();

    if (!tokens || tokens.length === 0) {
      throw new Error("No tokens provided");
    }

    if (!title || !body) {
      throw new Error("Title and body are required");
    }

    const normalizedData: Record<string, string> = {};
    if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data)) {
        normalizedData[key] = String(value ?? "");
      }
    }

    const validTokens = (tokens as string[]).filter(
      (token) => typeof token === "string" && token.length > 0,
    );
    const expoTokens = validTokens.filter((token) => EXPO_PUSH_REGEX.test(token));
    const fcmTokens = validTokens.filter((token) => !EXPO_PUSH_REGEX.test(token));

    console.log(
      `Sending notifications. Total: ${validTokens.length}, Expo: ${expoTokens.length}, FCM: ${fcmTokens.length}`,
    );

    const results: PushResult[] = [];

    if (expoTokens.length > 0) {
      const expoResults = await sendExpoNotifications(
        expoTokens,
        title,
        body,
        normalizedData,
        sound,
      );
      results.push(...expoResults);
    }

    if (fcmTokens.length > 0) {
      // Get Firebase service account from environment only when needed for FCM.
      const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (!serviceAccountJson) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT not configured in environment");
      }

      const serviceAccount = JSON.parse(serviceAccountJson);
      const projectId = serviceAccount.project_id;
      const accessToken = await getAccessToken(serviceAccount);

      for (const token of fcmTokens) {
        const fcmResult = await sendFcmNotification(
          token,
          title,
          body,
          normalizedData,
          sound,
          priority,
          accessToken,
          projectId,
        );
        results.push(fcmResult);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(
      `Push notifications sent: ${successCount} succeeded, ${failureCount} failed`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: validTokens.length,
          succeeded: successCount,
          failed: failureCount,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error sending push notifications:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "An error occurred",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
