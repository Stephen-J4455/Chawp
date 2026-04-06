import React from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { colors, spacing, radii, typography, responsive } from "../theme";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import {
  updateUserProfile,
  fetchUserStats,
  fetchRewardBadges,
  fetchPaymentMethods,
} from "../services/api";
import { supabase } from "../config/supabase";
import { useDataFetching } from "../hooks/useDataFetching";

const rewardBadges = [
  {
    id: "glow-gold",
    label: "Glow Gold",
    description: "Unlocked for 12 consecutive late-night orders",
    icon: "crown",
    color: colors.accent,
  },
  {
    id: "night-owl",
    label: "Night Owl",
    description: "Delivered between midnight and 3am five nights in a row",
    icon: "moon-waxing-crescent",
    color: colors.primary,
  },
];

const paymentMethods = [
  {
    id: "mobile-money",
    label: "Mobile Money (MTN, Vodafone, AirtelTigo)",
    icon: "phone-portrait",
  },
  { id: "card", label: "Debit/Credit Card (Visa, Mastercard)", icon: "card" },
  { id: "bank", label: "Bank Transfer", icon: "business" },
  { id: "ussd", label: "USSD Banking", icon: "keypad" },
];

export default function ProfilePage({ onNavigateToOrders, onOpenPrivacy }) {
  const { user, profile, signOut, updateProfile } = useAuth();
  const notification = useNotification();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [darkModeEnabled] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = React.useState(false);
  const [deletePassword, setDeletePassword] = React.useState("");
  const [deleteReason, setDeleteReason] = React.useState("");
  const [deletingAccount, setDeletingAccount] = React.useState(false);
  const [editedProfile, setEditedProfile] = React.useState({
    username: profile?.username || "",
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
    address: profile?.address || "",
  });

  // Fetch dynamic data with cache keys and user dependency
  const {
    data: userStats,
    loading: statsLoading,
    refresh: refreshStats,
  } = useDataFetching(fetchUserStats, [user?.id], `user-stats-${user?.id}`);
  const {
    data: rewardBadgesData,
    loading: badgesLoading,
    refresh: refreshBadges,
  } = useDataFetching(
    fetchRewardBadges,
    [user?.id],
    `reward-badges-${user?.id}`,
  );
  const {
    data: paymentMethodsData,
    loading: paymentsLoading,
    refresh: refreshPayments,
  } = useDataFetching(
    fetchPaymentMethods,
    [user?.id],
    `payment-methods-${user?.id}`,
  );

  React.useEffect(() => {
    if (profile) {
      console.log("Profile loaded:", profile);
      setEditedProfile({
        username: profile.username || "",
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        address: profile.address || "",
      });
    }
  }, [profile]);

  React.useEffect(() => {
    console.log("User data:", user);
    console.log("Profile data:", profile);
  }, [user, profile]);

  const handleSaveProfile = async () => {
    try {
      const result = await updateUserProfile(editedProfile);
      console.log("Profile update result:", result);

      // Reload the profile from context
      await updateProfile();

      setIsEditing(false);
      notification.success("Success", "Profile updated successfully!");
    } catch (error) {
      console.error("Profile update error:", error);
      notification.error(
        "Error",
        error.message || "Failed to update profile. Please try again.",
      );
    }
  };

  const handleSignOut = async () => {
    notification.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              notification.error(
                "Error",
                "Failed to sign out. Please try again.",
              );
            }
          },
        },
      ],
      { type: "warning" },
    );
  };

  const closeDeleteModal = () => {
    setDeleteModalVisible(false);
    setDeletePassword("");
    setDeleteReason("");
  };

  const promptDeleteAccount = () => {
    notification.alert(
      "Delete Account",
      "This will permanently delete your customer account. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => setDeleteModalVisible(true),
        },
      ],
      { type: "warning" },
    );
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      notification.warning(
        "Password Required",
        "Enter your password to confirm account deletion.",
      );
      return;
    }

    setDeletingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "account-lifecycle",
        {
          body: {
            action: "delete_customer",
            password: deletePassword,
            reason: deleteReason,
          },
        },
      );

      if (error) {
        throw new Error(error.message || "Failed to delete account");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to delete account");
      }

      closeDeleteModal();
      await signOut();

      notification.success(
        "Account Deleted",
        "Your account has been deleted successfully.",
      );
    } catch (error) {
      notification.error(
        "Deletion Failed",
        error.message || "Could not delete your account. Please try again.",
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleContactSupport = () => {
    // Open WhatsApp for support
    const phoneNumber = "233509330098"; // Ghana number format
    const message = encodeURIComponent("Hi Chawp Support, I need help with...");

    // Try both WhatsApp URL schemes
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    const whatsappAppUrl = `whatsapp://send?phone=${phoneNumber}&text=${message}`;

    // Try opening WhatsApp app first, then web fallback
    Linking.openURL(whatsappAppUrl)
      .catch(() => {
        Linking.openURL(whatsappUrl).catch(() => {
          // Final fallback to email
          const emailUrl = `mailto:support@chawp.com?subject=Support Request&body=${message}`;
          Linking.openURL(emailUrl);
        });
      })
      .catch((err) => {
        notification.error("Error", "Unable to open support contact");
      });
  };

  const handleOrderHistory = () => {
    // Navigate to orders page with history filter
    if (onNavigateToOrders) {
      onNavigateToOrders();
      // Scroll to history section will be handled by OrdersPage
      setTimeout(() => {
        notification.info("Order History", "Viewing your order history");
      }, 300);
    } else {
      notification.info(
        "Order History",
        "Opening your order history and statements...",
      );
    }
  };

  const handlePrivacyCenter = () => {
    console.log("handlePrivacyCenter called, onOpenPrivacy:", onOpenPrivacy);
    if (onOpenPrivacy) {
      console.log("Calling onOpenPrivacy");
      onOpenPrivacy();
    } else {
      console.log("onOpenPrivacy not available");
      notification.info(
        "Privacy Center",
        "Privacy settings will be available soon.",
      );
    }
  };

  const pickImage = async () => {
    try {
      // Request permissions
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        notification.warning(
          "Permission needed",
          "Please grant permission to access your photos",
        );
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      notification.error("Error", "Failed to pick image");
    }
  };

  const uploadImage = async (uri) => {
    try {
      const fileName = `${user.id}_${Date.now()}.jpg`;
      const filePath = `avatars/users/${user.id}/${fileName}`;

      // For React Native Expo, we need to create a FormData object
      const formData = new FormData();

      // Extract file info from URI
      const fileInfo = {
        uri: uri,
        type: "image/jpeg",
        name: fileName,
      };

      // Append to FormData (React Native compatible)
      formData.append("file", fileInfo);

      // Get the session for authorization
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Not authenticated");
      }

      // Upload using fetch with FormData (React Native compatible)
      const uploadResponse = await fetch(
        `${supabase.supabaseUrl}/storage/v1/object/chawp/${filePath}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.message || "Upload failed");
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("chawp").getPublicUrl(filePath);

      // Update profile
      await updateUserProfile({ avatar_url: publicUrl });
      await updateProfile(); // Refresh profile
      notification.success("Success", "Profile picture updated!");
    } catch (error) {
      console.error("Upload error:", error);
      notification.error("Error", error.message || "Failed to upload image");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
            <Image
              source={{
                uri:
                  profile?.avatar_url ||
                  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
              }}
              style={styles.avatar}
            />
            <View style={styles.avatarOverlay}>
              <Ionicons name="camera" size={16} color={colors.card} />
            </View>
          </TouchableOpacity>
          <View>
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {profile?.username || profile?.full_name || "User"}
            </Text>
            <Text style={styles.email}>{user?.email || "No email"}</Text>
            <Text style={styles.location}>
              {profile?.address || "No address set"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setIsEditing(!isEditing)}
        >
          <Ionicons
            name={isEditing ? "checkmark" : "create"}
            size={18}
            color={colors.card}
          />
          <Text style={styles.editButtonText}>
            {isEditing ? "Save" : "Edit profile"}
          </Text>
        </TouchableOpacity>
      </View>

      {isEditing && (
        <View style={styles.editSection}>
          <Text style={styles.editSectionTitle}>Edit Profile</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={user?.email || ""}
              editable={false}
              placeholder="Email address"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Username</Text>
            <TextInput
              style={styles.input}
              value={editedProfile.username}
              onChangeText={(text) =>
                setEditedProfile({ ...editedProfile, username: text })
              }
              placeholder="Enter your username"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={editedProfile.full_name}
              onChangeText={(text) =>
                setEditedProfile({ ...editedProfile, full_name: text })
              }
              placeholder="Enter your full name"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              value={editedProfile.phone}
              onChangeText={(text) =>
                setEditedProfile({ ...editedProfile, phone: text })
              }
              placeholder="Enter your phone number"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Address</Text>
            <TextInput
              style={styles.input}
              value={editedProfile.address}
              onChangeText={(text) =>
                setEditedProfile({ ...editedProfile, address: text })
              }
              placeholder="Enter your address"
              placeholderTextColor={colors.textSecondary}
              multiline
            />
          </View>

          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.editActionButton, styles.cancelButton]}
              onPress={() => {
                setIsEditing(false);
                setEditedProfile({
                  username: profile?.username || "",
                  full_name: profile?.full_name || "",
                  phone: profile?.phone || "",
                  address: profile?.address || "",
                });
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editActionButton, styles.saveButton]}
              onPress={handleSaveProfile}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.statsRow}>
        <StatCard
          label="Total Orders"
          value={`${userStats?.orderCount || 0} orders`}
          icon="receipt"
        />
        <StatCard
          label="Reviews Made"
          value={`${userStats?.reviewCount || 0} reviews`}
          icon="star"
        />
        <StatCard
          label="Reward tier"
          value={userStats?.rewardTier || "Bronze"}
          icon="medal"
        />
      </View>

      <SectionHeader title="Rewards" />
      <View style={styles.badgeList}>
        {(rewardBadgesData || rewardBadges).map((badge) => (
          <View key={badge.id} style={styles.badgeCard}>
            <View style={[styles.badgeIcon, { backgroundColor: badge.color }]}>
              <MaterialCommunityIcons
                name={badge.icon}
                size={20}
                color={colors.background}
              />
            </View>
            <View style={styles.badgeBody}>
              <Text style={styles.badgeTitle}>{badge.label}</Text>
              <Text style={styles.badgeDescription}>{badge.description}</Text>
            </View>
          </View>
        ))}
      </View>

      <SectionHeader title="Payment methods" />
      <View style={styles.paymentList}>
        <Text style={styles.paymentNote}>
          All payments are securely processed via Paystack
        </Text>
        {paymentMethods.map((method) => (
          <View key={method.id} style={styles.paymentCard}>
            <View style={styles.paymentInfo}>
              <Ionicons name={method.icon} size={20} color={colors.accent} />
              <Text style={styles.paymentLabel}>{method.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <SectionHeader title="Preferences" />
      <View style={styles.preferenceList}>
        <View style={styles.comingSoonCard}>
          <Ionicons name="time-outline" size={32} color={colors.accent} />
          <Text style={styles.comingSoonTitle}>Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            Preference settings will be available in the next update
          </Text>
        </View>
      </View>

      <SectionHeader title="Support" />
      <View style={styles.supportList}>
        <SupportRow
          icon="chatbubble-ellipses"
          label="Contact concierge"
          description="Reach our 24/7 support team on chat"
          onPress={handleContactSupport}
        />
        <SupportRow
          icon="document-text"
          label="Order history"
          description="Download statements and invoices"
          onPress={handleOrderHistory}
        />
        <SupportRow
          icon="shield-checkmark"
          label="Privacy center"
          description="Control data sharing and preferences"
          onPress={handlePrivacyCenter}
        />
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#ff4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteAccountButton}
        onPress={promptDeleteAccount}
      >
        <Ionicons name="trash-outline" size={20} color={colors.error} />
        <Text style={styles.deleteAccountText}>Delete Account</Text>
      </TouchableOpacity>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>
              Confirm Account Deletion
            </Text>
            <Text style={styles.deleteModalDescription}>
              Enter your password to permanently delete your customer account.
            </Text>

            <TextInput
              style={styles.deleteInput}
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
            />

            <TextInput
              style={[styles.deleteInput, styles.deleteReasonInput]}
              value={deleteReason}
              onChangeText={setDeleteReason}
              placeholder="Reason (optional)"
              placeholderTextColor={colors.textSecondary}
              multiline
            />

            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteCancelButton}
                onPress={closeDeleteModal}
                disabled={deletingAccount}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteConfirmButton}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color={colors.card} />
                ) : (
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function SectionHeader({ title, actionLabel }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <TouchableOpacity style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PreferenceRow({
  icon,
  label,
  description,
  value,
  onToggle,
  disabled = false,
  type = "toggle",
}) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceIcon}>
        <Ionicons name={icon} size={20} color={colors.textPrimary} />
      </View>
      <View style={styles.preferenceBody}>
        <Text style={styles.preferenceLabel}>{label}</Text>
        <Text style={styles.preferenceDescription}>{description}</Text>
      </View>
      {type === "toggle" ? (
        <Switch
          value={value}
          onValueChange={disabled ? undefined : onToggle}
          disabled={disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.card}
        />
      ) : (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      )}
    </View>
  );
}

function SupportRow({ icon, label, description, onPress }) {
  return (
    <TouchableOpacity
      style={styles.supportRow}
      onPress={onPress || (() => console.log(`${label} pressed`))}
    >
      <View style={styles.supportIcon}>
        <Ionicons name={icon} size={20} color={colors.textPrimary} />
      </View>
      <View style={styles.supportBody}>
        <Text style={styles.supportLabel}>{label}</Text>
        <Text style={styles.supportDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.highlight,
  },
  name: {
    ...typography.headline,
    color: colors.textPrimary,
    maxWidth: 120,
  },
  email: {
    color: colors.textSecondary,
    fontSize: responsive.scale(12),
    marginTop: spacing.xs / 2,
  },
  location: {
    color: colors.textSecondary,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  editButtonText: {
    color: colors.background,
    fontWeight: "700",
    fontSize: 14,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 18,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 13,
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
  badgeList: {
    gap: spacing.md,
  },
  badgeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeBody: {
    flex: 1,
    gap: spacing.xs,
  },
  badgeTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  badgeDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  paymentList: {
    gap: spacing.sm,
  },
  paymentNote: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.xs,
    fontStyle: "italic",
  },
  paymentCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  paymentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  paymentLabel: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  addPaymentButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
  },
  addPaymentText: {
    color: colors.primary,
    fontWeight: "700",
  },
  preferenceList: {
    gap: spacing.sm,
  },
  comingSoonCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  comingSoonText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  preferenceIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  preferenceBody: {
    flex: 1,
    gap: spacing.xs,
  },
  preferenceLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  preferenceDescription: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  supportList: {
    gap: spacing.sm,
  },
  supportRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  supportIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  supportBody: {
    flex: 1,
    gap: spacing.xs,
  },
  supportLabel: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  supportDescription: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  editSection: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  editSectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 18,
  },
  inputContainer: {
    gap: spacing.xs,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontSize: 16,
  },
  inputDisabled: {
    backgroundColor: colors.surface,
    color: colors.textMuted,
    opacity: 0.7,
  },
  editActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  editActionButton: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  saveButtonText: {
    color: colors.card,
    fontWeight: "600",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    marginTop: spacing.lg,
  },
  signOutText: {
    color: "#ff4444",
    fontWeight: "600",
    fontSize: 16,
  },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.error,
  },
  deleteAccountText: {
    color: colors.error,
    fontWeight: "700",
    fontSize: 16,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  deleteModalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  deleteModalTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  deleteModalDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  deleteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontSize: 15,
  },
  deleteReasonInput: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  deleteModalActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  deleteCancelButton: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  deleteCancelText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  deleteConfirmButton: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  deleteConfirmText: {
    color: colors.card,
    fontWeight: "700",
  },
  avatarContainer: {
    position: "relative",
  },
  avatarOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.card,
  },
});
