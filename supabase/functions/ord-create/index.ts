// Supabase Edge Function: ord-create (create unpaid order(s) for pay-after-delivery)
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const computeServiceFeeAmount = (
  subtotal: number,
  mode: string,
  flatAmount: number,
  percentageAmount: number,
) => {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;

  if (mode === "percentage") {
    if (!Number.isFinite(percentageAmount) || percentageAmount <= 0) return 0;
    return roundCurrency((subtotal * percentageAmount) / 100);
  }

  if (!Number.isFinite(flatAmount) || flatAmount <= 0) return 0;
  return roundCurrency(flatAmount);
};

const normalizeSize = (size: unknown): string | null => {
  if (typeof size !== "string") return null;
  const normalized = size.trim().toLowerCase();
  return normalized || null;
};

const normalizeSpecifications = (specifications: unknown) => {
  if (!Array.isArray(specifications)) return [];

  return [
    ...new Set(
      specifications.map((spec) => String(spec || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

const parseObjectLike = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }

    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
};

const toPositiveMoney = (value: unknown): number => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Number(amount.toFixed(2));
};

const extractLegacyOptionPriceMap = (
  options: unknown,
  normalizeKey: (key: string) => string | null,
): Record<string, number> => {
  if (!Array.isArray(options)) return {};

  const map: Record<string, number> = {};
  for (const option of options) {
    if (!option || typeof option !== "object") continue;

    const label =
      (option as any).value ??
      (option as any).name ??
      (option as any).label ??
      (option as any).size ??
      (option as any).spec;
    const key = normalizeKey(String(label || "").trim());
    if (!key) continue;

    const amount = toPositiveMoney(
      (option as any).extra_price ??
        (option as any).extraPrice ??
        (option as any).price_adjustment ??
        (option as any).price,
    );

    if (amount > 0) {
      map[key] = amount;
    }
  }

  return map;
};

const normalizePriceAdjustments = (
  priceMap: unknown,
  normalizeKey: (key: string) => string | null,
): Record<string, number> => {
  const normalizedSource = parseObjectLike(priceMap);
  if (!normalizedSource) {
    return {};
  }

  const normalized: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(normalizedSource)) {
    const normalizedKey = normalizeKey(String(key || "").trim());
    const value = toPositiveMoney(rawValue);
    if (!normalizedKey || value <= 0) continue;
    normalized[normalizedKey] = value;
  }

  return normalized;
};

const getMealPricingDetails = (
  meal: any,
  selectedSize: unknown,
  selectedSpecifications: unknown,
) => {
  const basePrice = Number(meal?.price || 0);
  const normalizedBasePrice = Number.isFinite(basePrice) ? basePrice : 0;

  const sizePriceMap = normalizePriceAdjustments(meal?.size_prices, (key) =>
    normalizeSize(key),
  );
  const specificationPriceMap = normalizePriceAdjustments(
    meal?.specification_prices,
    (key) => key.trim().toLowerCase() || null,
  );

  const mergedSizePriceMap = {
    ...extractLegacyOptionPriceMap(meal?.sizes, (key) => normalizeSize(key)),
    ...sizePriceMap,
  };
  const mergedSpecificationPriceMap = {
    ...extractLegacyOptionPriceMap(
      meal?.specifications,
      (key) => key.trim().toLowerCase() || null,
    ),
    ...specificationPriceMap,
  };

  const normalizedSize = normalizeSize(selectedSize);
  const normalizedSpecs = normalizeSpecifications(selectedSpecifications);

  const sizeAdjustment = normalizedSize
    ? Number(mergedSizePriceMap[normalizedSize] || 0)
    : 0;
  const specificationAdjustment = normalizedSpecs.reduce(
    (sum, specification) =>
      sum +
      Number(
        mergedSpecificationPriceMap[
          String(specification).trim().toLowerCase()
        ] || 0,
      ),
    0,
  );

  const unitPrice = Number(
    (normalizedBasePrice + sizeAdjustment + specificationAdjustment).toFixed(2),
  );

  return {
    unitPrice,
    totalAdjustment: Number(
      (sizeAdjustment + specificationAdjustment).toFixed(2),
    ),
  };
};

const formatSizeLabel = (size: unknown) => {
  const normalized = String(size || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const buildOrderItemInstructions = (item: any) => {
  const selectedSpecifications = normalizeSpecifications(
    item?.selected_specifications,
  );
  const customerNote = String(item?.special_instructions || "").trim();

  const lines: string[] = [];
  const selectedSize = formatSizeLabel(item?.selected_size);

  if (selectedSize) {
    lines.push(`Size: ${selectedSize}`);
  }

  if (selectedSpecifications.length > 0) {
    lines.push(`Specifications: ${selectedSpecifications.join(", ")}`);
  }

  if (customerNote) {
    lines.push(`Note: ${customerNote}`);
  }

  return lines.join("\n");
};

const allocateFeeAcrossGroups = (
  totalFee: number,
  vendorGroups: Array<{ vendorId: string; subtotal: number }>,
) => {
  const totalSubtotal = vendorGroups.reduce(
    (sum, group) => sum + group.subtotal,
    0,
  );
  if (!Number.isFinite(totalFee) || totalFee <= 0 || totalSubtotal <= 0) {
    return new Map(vendorGroups.map((g) => [g.vendorId, 0]));
  }

  const shares = new Map<string, number>();
  let allocated = 0;

  vendorGroups.forEach((group, index) => {
    if (index === vendorGroups.length - 1) {
      const remainder = roundCurrency(totalFee - allocated);
      shares.set(group.vendorId, remainder);
      return;
    }

    const raw = (totalFee * group.subtotal) / totalSubtotal;
    const share = roundCurrency(raw);
    allocated = roundCurrency(allocated + share);
    shares.set(group.vendorId, share);
  });

  return shares;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment is not configured correctly");
    }

    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const writeClient = supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey)
      : userClient;

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Authentication required");
    }

    const { orderData } = await req.json();

    const { data: userProfile, error: profileError } = await userClient
      .from("chawp_user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !userProfile) {
      throw new Error("User profile not found");
    }

    const { data: settingsRows, error: settingsError } = await userClient
      .from("chawp_app_settings")
      .select(
        "service_fee, delivery_fee, service_fee_mode, service_fee_percentage, pay_after_delivery_enabled",
      )
      .limit(1);

    if (settingsError) {
      throw new Error(`Failed to fetch app settings: ${settingsError.message}`);
    }

    if (!settingsRows || settingsRows.length === 0) {
      throw new Error("No app settings found");
    }

    const settings = settingsRows[0];
    if (!Boolean(settings.pay_after_delivery_enabled)) {
      throw new Error("Pay after delivery is currently disabled");
    }

    const baseServiceFee = Number(settings.service_fee);
    const baseDeliveryFee = Number(settings.delivery_fee);
    const serviceFeeMode =
      String(settings.service_fee_mode || "flat")
        .trim()
        .toLowerCase() === "percentage"
        ? "percentage"
        : "flat";
    const serviceFeePercentage = Number(settings.service_fee_percentage);

    const { data: cartItems, error: cartError } = await userClient
      .from("chawp_cart_items")
      .select(
        `
        *,
        meal:chawp_meals(
          *,
          vendor:chawp_vendors(*)
        )
      `,
      )
      .eq("user_id", user.id);

    if (cartError || !cartItems || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    const vendorGroups: Record<
      string,
      {
        vendorId: string;
        items: any[];
        subtotal: number;
      }
    > = {};

    let itemsSubtotal = 0;

    for (const item of cartItems as any[]) {
      const vendorId = String(item?.meal?.vendor?.id || "").trim();

      if (!vendorId) {
        throw new Error(`Item ${item.meal_id} has no vendor ID`);
      }

      if (!vendorGroups[vendorId]) {
        vendorGroups[vendorId] = {
          vendorId,
          items: [],
          subtotal: 0,
        };
      }

      const pricing = getMealPricingDetails(
        item.meal,
        item.selected_size,
        item.selected_specifications,
      );

      const itemTotal =
        Number(item.quantity || 0) * Number(pricing.unitPrice || 0);

      vendorGroups[vendorId].items.push({
        meal_id: item.meal_id,
        quantity: item.quantity,
        unit_price: pricing.unitPrice,
        selected_size: item.selected_size || null,
        selected_specifications: normalizeSpecifications(
          item.selected_specifications,
        ),
        meal_image:
          String(item?.meal?.image || "").trim() ||
          (Array.isArray(item?.meal?.images)
            ? String(item.meal.images[0] || "").trim() || null
            : null),
        special_instructions: buildOrderItemInstructions(item),
      });

      vendorGroups[vendorId].subtotal += itemTotal;
      itemsSubtotal += itemTotal;
    }

    itemsSubtotal = roundCurrency(itemsSubtotal);

    const serviceFee = computeServiceFeeAmount(
      itemsSubtotal,
      serviceFeeMode,
      baseServiceFee,
      serviceFeePercentage,
    );

    const deliveryFee = roundCurrency(
      Number.isFinite(baseDeliveryFee) ? baseDeliveryFee : 0,
    );

    const groups = Object.values(vendorGroups).map((g) => ({
      vendorId: g.vendorId,
      subtotal: roundCurrency(g.subtotal),
    }));

    const serviceFeeByVendor = allocateFeeAcrossGroups(serviceFee, groups);
    const deliveryFeeByVendor = allocateFeeAcrossGroups(deliveryFee, groups);

    const assignedDeliveryPersonnelId =
      String(orderData?.deliveryPersonnelId || "").trim() || null;

    const createdOrders: any[] = [];

    for (const group of Object.values(vendorGroups)) {
      const groupSubtotal = roundCurrency(group.subtotal);
      const orderServiceFee = roundCurrency(
        Number(serviceFeeByVendor.get(group.vendorId) || 0),
      );
      const orderDeliveryFee = roundCurrency(
        Number(deliveryFeeByVendor.get(group.vendorId) || 0),
      );

      const orderInsertData: any = {
        user_id: userProfile.id,
        vendor_id: group.vendorId,
        total_amount: groupSubtotal,
        service_fee: orderServiceFee,
        delivery_fee: orderDeliveryFee,
        delivery_address:
          orderData?.deliveryAddress || userProfile.address || "UPSA Campus",
        delivery_instructions: orderData?.deliveryInstructions || "",
        payment_method: "pay_after_delivery",
        payment_status: "unpaid",
        status: "pending",
      };

      if (assignedDeliveryPersonnelId) {
        orderInsertData.delivery_personnel_id = assignedDeliveryPersonnelId;
      }

      if (orderData?.deliveryLocation) {
        orderInsertData.delivery_location = orderData.deliveryLocation;
      }

      if (orderData?.scheduledFor) {
        orderInsertData.scheduled_for = orderData.scheduledFor;
      }

      const insertPayload: any = { ...orderInsertData };
      const optionalOrderColumns = ["delivery_location", "scheduled_for"];

      let { data: order, error: orderError } = await writeClient
        .from("chawp_orders")
        .insert(insertPayload)
        .select()
        .single();

      while (orderError) {
        const errorMessage = String(orderError.message || "");
        const missingColumn = optionalOrderColumns.find(
          (column) =>
            errorMessage.includes(`'${column}'`) &&
            Object.prototype.hasOwnProperty.call(insertPayload, column),
        );

        if (!missingColumn) {
          break;
        }

        // Allow older databases to proceed even when optional columns are absent.
        delete insertPayload[missingColumn];

        const retryResult = await writeClient
          .from("chawp_orders")
          .insert(insertPayload)
          .select()
          .single();

        order = retryResult.data;
        orderError = retryResult.error;
      }

      if (orderError) {
        throw new Error(orderError.message || "Failed to create order");
      }

      const orderItems = group.items.map((orderItem) => ({
        order_id: order.id,
        ...orderItem,
      }));

      const { error: itemsError } = await writeClient
        .from("chawp_order_items")
        .insert(orderItems);

      if (itemsError) {
        throw new Error(itemsError.message || "Failed to create order items");
      }

      createdOrders.push(order);

      // Notify vendor about new order.
      try {
        const { data: vendor } = await userClient
          .from("chawp_vendors")
          .select("name, chawp_user_profiles(push_token, username)")
          .eq("id", group.vendorId)
          .single();

        if (vendor?.chawp_user_profiles?.push_token) {
          const customerName =
            userProfile.username || userProfile.full_name || "Customer";
          const itemsCount = group.items.length;
          const itemsText = itemsCount === 1 ? "item" : "items";

          await userClient.functions.invoke("send-push-notification", {
            body: {
              tokens: [vendor.chawp_user_profiles.push_token],
              title: "🔔 New Order Received",
              body: `New pay-after-delivery order from ${customerName} with ${itemsCount} ${itemsText}. Total: GH₵${groupSubtotal.toFixed(2)}`,
              data: {
                orderId: order.id,
                type: "new_order",
                channelId: "orders",
              },
            },
          });
        }
      } catch (_notifError) {
        // Ignore notification errors.
      }
    }

    // Notify admins about new order(s).
    try {
      const { data: admins } = await userClient
        .from("chawp_user_profiles")
        .select("id, push_token, role")
        .in("role", ["admin", "super_admin"]);

      if (admins && admins.length > 0) {
        const adminIds = admins.map((admin) => admin.id);

        const { data: deviceTokens } = await userClient
          .from("chawp_device_tokens")
          .select("push_token")
          .in("user_id", adminIds)
          .eq("device_type", "admin");

        const profileTokens = admins
          .map((admin) => admin.push_token)
          .filter(Boolean);
        const deviceAppTokens =
          deviceTokens?.map((token) => token.push_token).filter(Boolean) || [];
        const allTokens = [...new Set([...profileTokens, ...deviceAppTokens])];

        if (allTokens.length > 0) {
          const customerName =
            userProfile.username || userProfile.full_name || "Customer";
          const totalAmount = roundCurrency(
            itemsSubtotal + serviceFee + deliveryFee,
          );

          await userClient.functions.invoke("send-push-notification", {
            body: {
              tokens: allTokens,
              title: "📦 New Order Placed",
              body: `${customerName} placed a pay-after-delivery order worth GH₵${totalAmount.toFixed(2)}`,
              data: {
                orderId: createdOrders[0]?.id,
                type: "new_order_admin",
                channelId: "admin-alerts",
              },
            },
          });
        }
      }
    } catch (_notifError) {
      // Ignore admin notification errors.
    }

    const { error: clearCartError } = await writeClient
      .from("chawp_cart_items")
      .delete()
      .eq("user_id", user.id);

    if (clearCartError) {
      console.error("Failed to clear cart:", clearCartError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        orders: createdOrders,
        fees: {
          itemsSubtotal,
          serviceFee,
          deliveryFee,
          totalAmount: roundCurrency(itemsSubtotal + serviceFee + deliveryFee),
        },
        message: "Order created (payment due after delivery)",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("ord-create error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "An unknown error occurred",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
