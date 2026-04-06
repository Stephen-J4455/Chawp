import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing, radii, typography, responsive } from "../theme";
import EmptyState from "../components/EmptyState";
import {
  fetchActiveOrders,
  fetchUpcomingDeliveries,
  fetchOrderHistory,
  fetchOrderStatistics,
  subscribeToActiveOrders,
  subscribeToOrderHistory,
  subscribeToUpcomingDeliveries,
  subscribeToOrderStatistics,
} from "../services/api";
import { useDataFetching } from "../hooks/useDataFetching";

// Helper function to format status text
const formatStatus = (status) => {
  const statusMap = {
    pending: "Order Received",
    confirmed: "Confirmed",
    preparing: "Preparing",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
  };
  return statusMap[status] || status;
};

// Helper function to get status badge color
const getStatusColor = (status) => {
  const colorMap = {
    pending: {
      backgroundColor: colors.accent + "20",
      borderColor: colors.accent,
    },
    confirmed: {
      backgroundColor: colors.primary + "20",
      borderColor: colors.primary,
    },
    preparing: { backgroundColor: "#F59E0B20", borderColor: "#F59E0B" },
    out_for_delivery: { backgroundColor: "#10B98120", borderColor: "#10B981" },
    delivered: { backgroundColor: "#10B98130", borderColor: "#10B981" },
  };
  return colorMap[status] || colorMap.pending;
};

const formatSizeLabel = (size) => {
  const normalized = String(size || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const buildMealMeta = (meal) => {
  const parts = [];
  const sizeLabel = formatSizeLabel(meal?.selectedSize);
  if (sizeLabel) parts.push(`Size: ${sizeLabel}`);

  const specs = Array.isArray(meal?.selectedSpecifications)
    ? meal.selectedSpecifications.filter(Boolean)
    : [];
  if (specs.length) parts.push(`Specs: ${specs.join(", ")}`);

  if (meal?.specialInstructions) {
    parts.push(`Note: ${meal.specialInstructions}`);
  }

  return parts.join(" • ");
};

export default function OrdersPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);

  // Fetch order data - use cache keys to persist data across navigation
  const {
    data: activeOrdersData,
    loading: activeOrdersLoading,
    refresh: refreshActiveOrders,
    setData: setActiveOrdersData,
  } = useDataFetching(fetchActiveOrders, [], "active-orders");
  const {
    data: upcomingDeliveriesData,
    loading: upcomingLoading,
    refresh: refreshUpcoming,
    setData: setUpcomingDeliveriesData,
  } = useDataFetching(fetchUpcomingDeliveries, [], "upcoming-deliveries");
  const {
    data: orderHistoryData,
    loading: historyLoading,
    refresh: refreshOrderHistory,
    setData: setOrderHistoryData,
  } = useDataFetching(() => fetchOrderHistory(1, 10), [], "order-history");
  const {
    data: orderStats,
    loading: statsLoading,
    refresh: refreshOrderStats,
    setData: setOrderStatsData,
  } = useDataFetching(fetchOrderStatistics, [], "order-stats");

  // Set up real-time subscriptions
  React.useEffect(() => {
    console.log("Setting up real-time subscriptions for orders");

    // Subscribe to active orders updates
    const unsubscribeActiveOrders = subscribeToActiveOrders((updatedOrders) => {
      console.log("Active orders updated:", updatedOrders.length);
      console.log(
        "Order structure:",
        updatedOrders.map((o) => ({
          id: o.id,
          restaurant: o.restaurant,
          mealCount: o.meals?.length || 0,
          meals: o.meals?.map((m) => m.name) || [],
        })),
      );
      setActiveOrdersData(updatedOrders);
    });

    // Subscribe to order history updates
    const unsubscribeOrderHistory = subscribeToOrderHistory(
      (updatedHistory) => {
        console.log("Order history updated");
        setOrderHistoryData(updatedHistory);
      },
    );

    // Subscribe to upcoming deliveries updates
    const unsubscribeUpcomingDeliveries = subscribeToUpcomingDeliveries(
      (updatedDeliveries) => {
        console.log("Upcoming deliveries updated:", updatedDeliveries.length);
        setUpcomingDeliveriesData(updatedDeliveries);
      },
    );

    // Subscribe to order statistics updates
    const unsubscribeOrderStats = subscribeToOrderStatistics((updatedStats) => {
      console.log("Order statistics updated");
      setOrderStatsData(updatedStats);
    });

    // Cleanup subscriptions on unmount
    return () => {
      console.log("Cleaning up real-time subscriptions");
      unsubscribeActiveOrders();
      unsubscribeOrderHistory();
      unsubscribeUpcomingDeliveries();
      unsubscribeOrderStats();
    };
  }, []);

  // Pull to refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshActiveOrders(),
      refreshUpcoming(),
      refreshOrderHistory(),
      refreshOrderStats(),
    ]);
    setRefreshing(false);
  };

  // Extract items from order history response
  const orderHistoryItems = orderHistoryData?.items || [];

  // Calculate total amount for all active orders
  const activeOrdersTotal = activeOrdersData
    ? activeOrdersData.reduce((sum, order) => sum + (order.total || 0), 0)
    : 0;

  return (
    <View style={styles.pageContainer}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Orders</Text>
          <TouchableOpacity style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Order settings</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Golden Tickets - Order Statistics */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statIconWrapper}>
              <Ionicons
                name="receipt-outline"
                size={24}
                color={colors.accent}
              />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statValue}>
                {orderStats?.totalOrders || 0}
              </Text>
              <Text style={styles.statLabel}>Total Orders</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconWrapper}>
              <Ionicons name="cart-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statValue}>
                GH₵{activeOrdersTotal.toFixed(2)}
              </Text>
              <Text style={styles.statLabel}>Active Orders Total</Text>
            </View>
          </View>
        </View>

        <SectionHeader
          title="Active orders"
          actionLabel={
            activeOrdersData?.length > 0
              ? `${activeOrdersData.length} active`
              : ""
          }
        />
        {activeOrdersLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading active orders...</Text>
          </View>
        ) : (
          <View style={styles.activeOrdersList}>
            {!activeOrdersData || activeOrdersData.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title="No active orders"
                message="Your current orders will appear here"
              />
            ) : (
              activeOrdersData.map((order) => (
                <View key={order.id} style={styles.activeOrderCard}>
                  {/* Compact Header with Vendor, Status, and Total */}
                  <View style={styles.compactCardHeader}>
                    <View style={styles.compactHeaderLeft}>
                      <Image
                        source={{ uri: order.vendorImage }}
                        style={styles.compactVendorImage}
                      />
                      <View style={styles.compactVendorInfo}>
                        <Text style={styles.compactRestaurantName}>
                          {order.restaurant}
                        </Text>
                        <Text style={styles.compactOrderId}>
                          Order #
                          {order.id?.substring(0, 8).toUpperCase() || "N/A"} •{" "}
                          {order.meals?.length || 0}{" "}
                          {order.meals?.length === 1 ? "item" : "items"}
                        </Text>
                        <View style={styles.compactStatusRow}>
                          <View
                            style={[
                              styles.statusBadge,
                              getStatusColor(order.status),
                            ]}
                          >
                            <Text style={styles.statusText}>
                              {formatStatus(order.status)}
                            </Text>
                          </View>
                          <Ionicons
                            name="time-outline"
                            size={12}
                            color={colors.accent}
                          />
                          <Text style={styles.etaText}>{order.eta}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.compactTotal}>
                      <Text style={styles.compactTotalAmount}>
                        GH₵{order.total?.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* All meal items with images in grid */}
                  <View style={styles.compactItemsGrid}>
                    {order.meals?.map((meal, index) => (
                      <View key={index} style={styles.compactGridItem}>
                        <Image
                          source={{ uri: meal.image }}
                          style={styles.compactGridItemImage}
                        />
                        <Text
                          style={styles.compactGridItemName}
                          numberOfLines={1}
                        >
                          {meal.name}
                        </Text>
                        <Text style={styles.compactGridItemQty}>
                          ×{meal.quantity}
                        </Text>
                        {buildMealMeta(meal) ? (
                          <Text
                            style={styles.compactGridItemMeta}
                            numberOfLines={2}
                          >
                            {buildMealMeta(meal)}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  {/* Quick Actions */}
                  <View style={styles.compactActions}>
                    <TouchableOpacity
                      style={styles.compactActionButton}
                      onPress={() => {
                        setSelectedOrder(order);
                        setShowTrackingModal(true);
                      }}
                    >
                      <Ionicons
                        name="location-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={styles.compactActionText}>Track</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.compactActionButton}
                      onPress={() => {
                        setSelectedOrder(order);
                        setShowReceiptModal(true);
                      }}
                    >
                      <Ionicons
                        name="receipt-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={styles.compactActionText}>Receipt</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Upcoming deliveries section hidden for future updates */}
        {/* 
                <View style={styles.upcomingBody}>
                  <Text style={styles.upcomingRestaurant}>
                    {delivery.restaurant}
                  </Text>
                  <Text style={styles.upcomingSchedule}>
                    {delivery.schedule}
                  </Text>
                  <View style={styles.upcomingLocationRow}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.upcomingLocation}>
                      {delivery.deliveryAddress || "UPSA Campus, Accra"}
                    </Text>
                  </View>
                  <Text style={styles.upcomingItems}>{delivery.items}</Text>
                </View>
                <View style={styles.upcomingMeta}>
                  <Text style={styles.upcomingTotal}>
                    GH₵{delivery.total?.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}
      */}

        <SectionHeader
          title="Order history"
          actionLabel={
            orderHistoryItems?.length > 0
              ? `${orderHistoryItems.length} orders`
              : ""
          }
        />
        {historyLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading order history...</Text>
          </View>
        ) : (
          <FlatList
            data={orderHistoryItems.slice(0, 5)}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => (
              <View style={styles.historyDivider} />
            )}
            ListEmptyComponent={() => (
              <EmptyState
                icon="receipt-outline"
                title="No order history"
                message="Your delivered orders will appear here"
              />
            )}
            renderItem={({ item }) => (
              <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyRestaurant}>
                      {item.restaurant}
                    </Text>
                    <Text style={styles.historyDate}>{item.date}</Text>
                  </View>
                  <View style={styles.historyMeta}>
                    <Text style={styles.historyTotal}>
                      GH₵{item.total?.toFixed(2)}
                    </Text>
                    <View style={styles.ratingRow}>
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Ionicons
                          key={`${item.id}-star-${index}`}
                          name={
                            index < (item.rating || 0) ? "star" : "star-outline"
                          }
                          size={16}
                          color={colors.accent}
                        />
                      ))}
                    </View>
                  </View>
                </View>

                {/* Meal Items */}
                {item.meals && item.meals.length > 0 && (
                  <View style={styles.historyMealsContainer}>
                    {item.meals.slice(0, 3).map((meal, index) => (
                      <View key={index} style={styles.historyMealItem}>
                        <Image
                          source={{ uri: meal.image }}
                          style={styles.historyMealImage}
                        />
                        <View style={styles.historyMealInfo}>
                          <Text
                            style={styles.historyMealName}
                            numberOfLines={1}
                          >
                            {meal.name}
                          </Text>
                          <Text style={styles.historyMealQuantity}>
                            Qty: {meal.quantity}
                          </Text>
                          {buildMealMeta(meal) ? (
                            <Text
                              style={styles.historyMealMeta}
                              numberOfLines={2}
                            >
                              {buildMealMeta(meal)}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.historyMealPrice}>
                          GH₵{(meal.price * meal.quantity).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                    {item.meals.length > 3 && (
                      <Text style={styles.moreItemsText}>
                        +{item.meals.length - 3} more item(s)
                      </Text>
                    )}
                  </View>
                )}

                {/* Delivery Address */}
                <View style={styles.historyLocationRow}>
                  <Ionicons
                    name="location-outline"
                    size={12}
                    color={colors.textMuted}
                  />
                  <Text style={styles.historyLocation}>
                    {item.deliveryAddress || "UPSA Campus, Accra"}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </ScrollView>

      {/* Receipt Modal */}
      {showReceiptModal && selectedOrder && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.receiptModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowReceiptModal(false)}
          />
          <View style={styles.receiptModal}>
            {/* Close Button Top Right */}
            <TouchableOpacity
              style={styles.receiptCloseIconButton}
              onPress={() => setShowReceiptModal(false)}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>

            <ScrollView style={styles.receiptContent}>
              {/* Logo and Header */}
              <View style={styles.receiptLogoContainer}>
                <Image
                  source={require("../../assets/chawp.png")}
                  style={styles.receiptLogoImage}
                />
                <Text style={styles.receiptSubtitle}>
                  Food Delivery Receipt
                </Text>
              </View>

              {/* Divider */}
              <View style={styles.receiptDivider} />

              {/* Order ID and Status */}
              <View style={styles.receiptInfoRow}>
                <Text style={styles.receiptInfoLabel}>Order ID:</Text>
                <Text style={styles.receiptInfoValue}>
                  {selectedOrder.id?.substring(0, 8).toUpperCase() || "N/A"}
                </Text>
              </View>
              <View style={styles.receiptInfoRow}>
                <Text style={styles.receiptInfoLabel}>Status:</Text>
                <Text style={styles.receiptInfoValue}>
                  {selectedOrder.status}
                </Text>
              </View>
              <View style={styles.receiptInfoRow}>
                <Text style={styles.receiptInfoLabel}>Date:</Text>
                <Text style={styles.receiptInfoValue}>
                  {new Date(selectedOrder.createdAt).toLocaleDateString()}
                </Text>
              </View>

              {/* Divider */}
              <View style={styles.receiptDivider} />

              {/* Restaurant Info */}
              <View style={styles.receiptRestaurantSection}>
                <Text style={styles.receiptRestaurantName}>
                  {selectedOrder.restaurant}
                </Text>
              </View>

              {/* Items Header */}
              <View style={styles.receiptItemsHeader}>
                <Text style={styles.receiptItemsHeaderCol1}>Item</Text>
                <Text style={styles.receiptItemsHeaderCol2}>Qty</Text>
                <Text style={styles.receiptItemsHeaderCol3}>Price</Text>
              </View>
              <View style={styles.receiptDivider} />

              {/* Items */}
              {selectedOrder.meals?.map((meal, index) => (
                <View key={index} style={styles.receiptItemBlock}>
                  <View style={styles.receiptItemRow}>
                    <Text style={styles.receiptItemCol1}>{meal.name}</Text>
                    <Text style={styles.receiptItemCol2}>{meal.quantity}</Text>
                    <Text style={styles.receiptItemCol3}>
                      GH₵{(meal.price * meal.quantity).toFixed(2)}
                    </Text>
                  </View>
                  {buildMealMeta(meal) ? (
                    <Text style={styles.receiptItemMeta}>
                      {buildMealMeta(meal)}
                    </Text>
                  ) : null}
                </View>
              ))}

              <View style={styles.receiptDivider} />

              {/* Subtotal and Fees */}
              <View style={styles.receiptCalculation}>
                <View style={styles.receiptCalcRow}>
                  <Text style={styles.receiptCalcLabel}>Subtotal:</Text>
                  <Text style={styles.receiptCalcValue}>
                    GH₵
                    {(
                      selectedOrder.meals?.reduce(
                        (sum, meal) => sum + meal.price * meal.quantity,
                        0,
                      ) || 0
                    ).toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Total */}
              <View style={styles.receiptTotalSection}>
                <Text style={styles.receiptTotalLabel}>Order Subtotal</Text>
                <Text style={styles.receiptTotalAmount}>
                  GH₵{selectedOrder.total?.toFixed(2)}
                </Text>
                <Text style={styles.receiptTotalNote}>
                  Service fee & delivery charges applied at checkout
                </Text>
              </View>

              {/* Delivery Address */}
              <View style={styles.receiptAddressSection}>
                <Text style={styles.receiptAddressLabel}>
                  Delivery Address:
                </Text>
                <Text style={styles.receiptAddressText}>
                  {selectedOrder.deliveryAddress || "UPSA Campus, Accra"}
                </Text>
              </View>

              {/* Footer */}
              <View style={styles.receiptFooter}>
                <Text style={styles.receiptThankYou}>
                  Thank you for your order!
                </Text>
                <Text style={styles.receiptFooterText}>
                  Download this receipt from your account
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* Tracking Modal */}
      {showTrackingModal && selectedOrder && (
        <View style={styles.modalOverlay}>
          <View style={styles.trackingModal}>
            <View style={styles.trackingHeader}>
              <Text style={styles.trackingTitle}>Track Order</Text>
              <TouchableOpacity onPress={() => setShowTrackingModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.trackingContent}>
              {/* Restaurant Info */}
              <View style={styles.trackingRestaurant}>
                <Image
                  source={{ uri: selectedOrder.vendorImage }}
                  style={styles.trackingVendorImage}
                />
                <View>
                  <Text style={styles.trackingRestaurantName}>
                    {selectedOrder.restaurant}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      getStatusColor(selectedOrder.status),
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {formatStatus(selectedOrder.status)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Order Timeline */}
              <View style={styles.timeline}>
                <View style={[styles.timelineStep, styles.timelineStepActive]}>
                  <View style={styles.timelineIcon}>
                    <Ionicons name="checkmark" size={16} color={colors.card} />
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLabel}>Order Confirmed</Text>
                    <Text style={styles.timelineTime}>Just now</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.timelineStep,
                    selectedOrder.status !== "pending" &&
                      styles.timelineStepActive,
                  ]}
                >
                  <View style={styles.timelineIcon}>
                    {selectedOrder.status !== "pending" ? (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={colors.card}
                      />
                    ) : (
                      <View style={styles.timelineProgress} />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLabel}>Being Prepared</Text>
                    <Text style={styles.timelineTime}>
                      {selectedOrder.status === "pending"
                        ? "In progress"
                        : "Completed"}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.timelineStep,
                    selectedOrder.status === "out_for_delivery" &&
                      styles.timelineStepActive,
                  ]}
                >
                  <View style={styles.timelineIcon}>
                    {selectedOrder.status === "out_for_delivery" ? (
                      <View style={styles.timelineProgress} />
                    ) : (
                      <View style={styles.timelineEmptyIcon} />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLabel}>Out for Delivery</Text>
                    <Text style={styles.timelineTime}>
                      {selectedOrder.status === "out_for_delivery"
                        ? "In progress"
                        : "Pending"}
                    </Text>
                  </View>
                </View>

                <View style={styles.timelineStep}>
                  <View style={styles.timelineIcon}>
                    <View style={styles.timelineEmptyIcon} />
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLabel}>Delivered</Text>
                    <Text style={styles.timelineTime}>Pending</Text>
                  </View>
                </View>
              </View>

              {/* ETA */}
              <View style={styles.etaSection}>
                <Ionicons
                  name="timer-outline"
                  size={24}
                  color={colors.primary}
                />
                <View>
                  <Text style={styles.etaLabel}>Estimated Delivery</Text>
                  <Text style={styles.etaTime}>{selectedOrder.eta}</Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.trackingCloseButton}
              onPress={() => setShowTrackingModal(false)}
            >
              <Text style={styles.trackingCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function SectionHeader({ title, actionLabel }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && (
        <TouchableOpacity style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: 50,
    gap: spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerButtonText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  statsContainer: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  statIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  statContent: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  statValue: {
    textAlign: "center",
    ...typography.headline,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "700",
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: "center",
    fontWeight: "400",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  activeOrdersList: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  activeOrderCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  activeOrderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  vendorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  vendorImage: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  activeRestaurantName: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.textPrimary,
  },
  etaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  etaText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
  },
  mealsContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  mealItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  mealImage: {
    width: 50,
    height: 50,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
    marginBottom: 2,
  },
  mealQuantity: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  mealPrice: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  moreItemsText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
  activeOrderFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  deliveryAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  deliveryAddress: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.xs,
  },
  totalLabel: {
    ...typography.headline,
    color: colors.textSecondary,
  },
  totalAmount: {
    ...typography.title,
    color: colors.primary,
    fontSize: 24,
  },
  // Compact card styles
  compactCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  compactHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  compactVendorImage: {
    width: 45,
    height: 45,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  compactVendorInfo: {
    flex: 1,
  },
  compactRestaurantName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 2,
  },
  compactOrderId: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  compactStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  compactTotal: {
    alignItems: "flex-end",
  },
  compactTotalAmount: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "700",
    fontSize: 16,
  },
  compactItemsGrid: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "flex-start",
  },
  compactGridItem: {
    width: "23%",
    alignItems: "center",
    gap: spacing.xs,
  },
  compactGridItemImage: {
    width: "100%",
    height: 60,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  compactGridItemName: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: "center",
  },
  compactGridItemQty: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "600",
  },
  compactGridItemMeta: {
    fontSize: 9,
    color: colors.textMuted,
    textAlign: "center",
  },
  compactItemsSummary: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  compactItemText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  compactMoreItems: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  compactActions: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  compactActionButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  compactActionText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  viewReceiptButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  viewReceiptText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sectionActionText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  upcomingList: {
    gap: spacing.md,
  },
  upcomingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  upcomingImage: {
    width: 70,
    height: 70,
    borderRadius: radii.md,
  },
  upcomingBody: {
    flex: 1,
    gap: spacing.xs,
  },
  upcomingRestaurant: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  upcomingSchedule: {
    color: colors.textSecondary,
  },
  upcomingItems: {
    color: colors.textMuted,
    fontSize: 12,
  },
  upcomingLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  upcomingLocation: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  upcomingMeta: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  upcomingTotal: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  upcomingLink: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  loadingText: {
    color: colors.textSecondary,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xl,
    fontSize: 14,
  },
  historyDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  historyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyLeft: {
    flex: 1,
  },
  historyRestaurant: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  historyDate: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.xs / 2,
  },
  historyMealsContainer: {
    marginBottom: spacing.md,
  },
  historyMealItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "40",
  },
  historyMealImage: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    marginRight: spacing.sm,
  },
  historyMealInfo: {
    flex: 1,
  },
  historyMealName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  historyMealQuantity: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  historyMealMeta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  historyMealPrice: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  historyLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.xs,
  },
  historyLocation: {
    fontSize: 12,
    color: colors.textMuted,
  },
  historyMeta: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  historyTotal: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  ratingRow: {
    flexDirection: "row",
    gap: spacing.xs / 2,
  },
  loadingContainer: {
    paddingVertical: spacing.xl * 2,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "500",
  },
  // Modal Styles
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    display: "flex",
  },
  receiptModalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  receiptModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: radii.xl,
    maxHeight: "80%",
    height: "80%",
    width: "88%",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 15,
    position: "relative",
    flexShrink: 1,
  },
  receiptCloseIconButton: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    zIndex: 1,
    padding: spacing.xs,
  },
  receiptContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingTop: spacing.sm,
    flex: 1,
  },
  receiptLogoContainer: {
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingTop: 0,
  },
  receiptLogoImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    resizeMode: "contain",
    marginBottom: spacing.xs / 2,
  },
  receiptLogo: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: spacing.xs / 2,
  },
  receiptSubtitle: {
    fontSize: 11,
    color: "#666",
    fontWeight: "500",
  },
  receiptDivider: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginVertical: spacing.sm,
  },
  receiptInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs / 2,
  },
  receiptInfoLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  receiptInfoValue: {
    fontSize: 12,
    color: "#333",
    fontWeight: "500",
  },
  receiptRestaurantSection: {
    alignItems: "center",
    marginVertical: spacing.sm,
  },
  receiptRestaurantName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  receiptItemsHeader: {
    flexDirection: "row",
    paddingVertical: spacing.xs / 2,
  },
  receiptItemsHeaderCol1: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: "#333",
    textTransform: "uppercase",
  },
  receiptItemsHeaderCol2: {
    width: 35,
    fontSize: 10,
    fontWeight: "700",
    color: "#333",
    textTransform: "uppercase",
  },
  receiptItemsHeaderCol3: {
    width: 65,
    fontSize: 10,
    fontWeight: "700",
    color: "#333",
    textAlign: "right",
    textTransform: "uppercase",
  },
  receiptItemRow: {
    flexDirection: "row",
    paddingVertical: spacing.xs / 2,
  },
  receiptItemBlock: {
    paddingVertical: spacing.xs / 2,
  },
  receiptItemCol1: {
    flex: 1,
    fontSize: 12,
    color: "#333",
  },
  receiptItemCol2: {
    width: 35,
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
  receiptItemCol3: {
    width: 65,
    fontSize: 12,
    color: "#333",
    fontWeight: "600",
    textAlign: "right",
  },
  receiptItemMeta: {
    fontSize: 10,
    color: "#666",
    marginTop: 2,
    marginLeft: 2,
  },
  receiptCalculation: {
    marginVertical: spacing.sm,
  },
  receiptCalcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs / 2,
  },
  receiptCalcLabel: {
    fontSize: 11,
    color: "#666",
    fontWeight: "500",
  },
  receiptCalcValue: {
    fontSize: 11,
    color: "#333",
    fontWeight: "600",
  },
  receiptTotalSection: {
    backgroundColor: "#F5F5F5",
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    marginVertical: spacing.md,
  },
  receiptTotalLabel: {
    fontSize: 11,
    color: "#666",
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: spacing.xs / 2,
  },
  receiptTotalAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.primary,
  },
  receiptTotalNote: {
    fontSize: 9,
    color: "#999",
    marginTop: spacing.xs,
    fontStyle: "italic",
    textAlign: "center",
  },
  receiptAddressSection: {
    marginVertical: spacing.sm,
  },
  receiptAddressLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    marginBottom: spacing.xs / 2,
  },
  receiptAddressText: {
    fontSize: 12,
    color: "#333",
    lineHeight: 16,
  },
  receiptFooter: {
    alignItems: "center",
    marginVertical: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  receiptThankYou: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginBottom: spacing.xs / 2,
  },
  receiptFooterText: {
    fontSize: 10,
    color: "#999",
    fontStyle: "italic",
  },
  trackingModal: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "85%",
    height: "85%",
    width: "88%",
    overflow: "hidden",
    paddingTop: spacing.sm,
  },
  trackingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  trackingTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  trackingContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flex: 1,
  },
  trackingRestaurant: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.lg,
  },
  trackingVendorImage: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
  },
  trackingRestaurantName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  timeline: {
    paddingVertical: spacing.lg,
  },
  timelineStep: {
    flexDirection: "row",
    marginBottom: spacing.lg,
    alignItems: "flex-start",
  },
  timelineStepActive: {
    opacity: 1,
  },
  timelineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    marginTop: 2,
  },
  timelineProgress: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  timelineEmptyIcon: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  timelineContent: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  timelineLabel: {
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
    marginBottom: spacing.xs / 2,
  },
  timelineTime: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  etaSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginTop: spacing.lg,
  },
  etaLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.xs / 2,
  },
  etaTime: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  trackingCloseButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    alignItems: "center",
  },
  trackingCloseButtonText: {
    color: colors.card,
    fontWeight: "700",
    fontSize: 16,
  },
});
