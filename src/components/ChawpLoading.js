import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme";

export default function ChawpLoading({
  message = "Loading delicious options...",
}) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse animation for the main circle
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Fade animation for the text
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0.3,
          duration: 1500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Rotation animation for outer ring
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container}>
      <View style={styles.animationContainer}>
        {/* Outer rotating ring */}
        <Animated.View
          style={[
            styles.outerRing,
            {
              transform: [{ rotate }],
            },
          ]}>
          <LinearGradient
            colors={[colors.primary, colors.accent, colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ringGradient}
          />
        </Animated.View>

        {/* Pulsing center circle */}
        <Animated.View
          style={[
            styles.centerCircle,
            {
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}>
          <LinearGradient
            colors={[colors.primary, colors.primaryMuted]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.circleGradient}>
            <Text style={styles.logoText}>C</Text>
          </LinearGradient>
        </Animated.View>

        {/* Inner static circle */}
        <View style={styles.innerCircle}>
          <Text style={styles.innerLogoText}>Chawp</Text>
        </View>
      </View>

      {/* Loading message */}
      <Animated.Text style={[styles.loadingText, { opacity: fadeAnim }]}>
        {message}
      </Animated.Text>

      {/* Animated dots */}
      <View style={styles.dotsContainer}>
        {[0, 1, 2].map((index) => (
          <AnimatedDot key={index} delay={index * 200} />
        ))}
      </View>
    </View>
  );
}

function AnimatedDot({ delay }) {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [delay]);

  const translateY = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          transform: [{ translateY }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  animationContainer: {
    width: 140,
    height: 140,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  outerRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: "hidden",
  },
  ringGradient: {
    flex: 1,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: colors.background,
  },
  centerCircle: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: "hidden",
  },
  circleGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 50,
  },
  logoText: {
    fontSize: 48,
    fontWeight: "bold",
    color: colors.card,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  innerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.primary + "40",
  },
  innerLogoText: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.primary,
    letterSpacing: 1,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 16,
    textAlign: "center",
  },
  dotsContainer: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
