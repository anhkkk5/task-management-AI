/**
 * Shared Color Configuration
 *
 * This file defines the centralized color palette for the AI-powered task management application.
 * The color system follows a 60-30-10 rule:
 * - 60% Neutral: Clean white and light gray backgrounds
 * - 30% Soft Blue: Professional blue accents inspired by MongoDB
 * - 10% Accent: Success, warning, error, and info states
 *
 * This configuration is used across both frontend (React) and backend (Node.js) workspaces.
 */

/**
 * Color Palette
 *
 * Organized by role and intensity, providing a harmonious color system
 * that ensures visual consistency and accessibility.
 */
export const colorPalette = {
  // Neutral (60%) - Clean white and light gray backgrounds for spacious, minimal design
  neutral: {
    white: "#FFFFFF", // Pure white - primary background
    offWhite: "#F9FAFB", // Off-white - subtle background variation
    lightGray: "#F5F7FA", // Light gray - secondary background
    mediumLightGray: "#E8ECEF", // Medium light gray - tertiary background
    lightBorderGray: "#D1D5DB", // Light border gray - borders and dividers
  },

  // Soft Blue (30%) - Professional blue accents inspired by MongoDB
  softBlue: {
    primary: "#0066CC", // Primary blue - main accent color
    secondary: "#1A73E8", // Secondary blue - hover and active states
    light: "#4D94FF", // Light blue - lighter accents
    lighter: "#B3D9FF", // Lighter blue - subtle backgrounds
    veryLight: "#E6F0FF", // Very light blue - very subtle backgrounds
  },

  // Accent (10%) - Semantic colors for user feedback and states
  accent: {
    success: "#10B981", // Success - positive feedback
    warning: "#F59E0B", // Warning - caution and alerts
    error: "#EF4444", // Error - critical issues
    info: "#3B82F6", // Info - informational messages
  },
};

/**
 * Design Tokens
 *
 * Semantic naming layer that maps tokens to specific colors from the palette.
 * Tokens follow the naming convention: [element]-[state]-[property]
 *
 * This layer provides a more maintainable way to reference colors throughout
 * the application without needing to know specific hex codes.
 */
export const designTokens = {
  // Background colors
  background: {
    primary: colorPalette.neutral.white,
    secondary: colorPalette.neutral.offWhite,
    tertiary: colorPalette.neutral.lightGray,
  },

  // Button styles
  button: {
    primary: {
      bg: colorPalette.softBlue.primary,
      bgHover: colorPalette.softBlue.secondary,
      text: colorPalette.neutral.white,
    },
    secondary: {
      bg: colorPalette.neutral.lightGray,
      bgHover: colorPalette.neutral.mediumLightGray,
      text: colorPalette.softBlue.primary,
    },
    disabled: {
      bg: colorPalette.neutral.mediumLightGray,
      text: colorPalette.neutral.lightBorderGray,
    },
  },

  // Card and surface styles
  card: {
    bg: colorPalette.neutral.white,
    border: colorPalette.neutral.lightBorderGray,
    shadow: "rgba(0, 0, 0, 0.06)",
  },

  // Text colors
  text: {
    primary: "#3C4043",
    secondary: "#5F6368",
    tertiary: "#70757A",
    inverse: colorPalette.neutral.white,
  },

  // Border colors
  border: {
    light: colorPalette.neutral.lightBorderGray,
    medium: colorPalette.neutral.mediumLightGray,
  },

  // State colors
  state: {
    success: colorPalette.accent.success,
    warning: colorPalette.accent.warning,
    error: colorPalette.accent.error,
    info: colorPalette.accent.info,
  },
};
