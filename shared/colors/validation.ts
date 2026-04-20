/**
 * Color System Validation Utilities
 *
 * This module provides validation functions for the color system, including:
 * - Hex code format validation
 * - WCAG AA contrast ratio calculation
 * - Color palette structure validation
 * - Fallback colors for error scenarios
 */

import { colorPalette, designTokens } from "./colors.config";

/**
 * Fallback colors for error scenarios
 *
 * These colors are used when the main color configuration fails to load
 * or when a color is not available in the palette.
 */
export const fallbackColors = {
  primary: "#0066CC",
  text: "#3C4043",
  background: "#FFFFFF",
};

/**
 * Validates if a color string is a valid hex code in the format #RRGGBB
 *
 * @param color - The color string to validate
 * @returns true if the color is a valid hex code, false otherwise
 *
 * @example
 * validateColorHex("#0066CC") // true
 * validateColorHex("#FFF") // false (too short)
 * validateColorHex("0066CC") // false (missing #)
 * validateColorHex("#GGGGGG") // false (invalid hex characters)
 */
export function validateColorHex(color: string): boolean {
  if (typeof color !== "string") {
    return false;
  }
  return /^#[0-9A-F]{6}$/i.test(color);
}

/**
 * Calculates the relative luminance of a color
 *
 * Uses the WCAG formula for calculating relative luminance:
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 *
 * @param color - The hex color code
 * @returns The relative luminance value (0-1)
 */
function getRelativeLuminance(color: string): number {
  // Remove the # and convert to RGB
  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  // Apply gamma correction
  const luminanceComponent = (value: number): number => {
    if (value <= 0.03928) {
      return value / 12.92;
    }
    return Math.pow((value + 0.055) / 1.055, 2.4);
  };

  const rLum = luminanceComponent(r);
  const gLum = luminanceComponent(g);
  const bLum = luminanceComponent(b);

  // Calculate relative luminance
  return 0.2126 * rLum + 0.7152 * gLum + 0.0722 * bLum;
}

/**
 * Calculates the contrast ratio between two colors
 *
 * Uses the WCAG formula for contrast ratio:
 * (L1 + 0.05) / (L2 + 0.05)
 * where L1 is the relative luminance of the lighter color
 * and L2 is the relative luminance of the darker color
 *
 * WCAG AA requires a minimum contrast ratio of 4.5:1 for normal text
 * WCAG AAA requires a minimum contrast ratio of 7:1 for normal text
 *
 * @param color1 - The first hex color code
 * @param color2 - The second hex color code
 * @returns The contrast ratio (e.g., 8.59 for WCAG AA pass)
 *
 * @example
 * getContrastRatio("#0066CC", "#FFFFFF") // ~8.59 (passes WCAG AA)
 * getContrastRatio("#CCCCCC", "#FFFFFF") // ~1.07 (fails WCAG AA)
 */
export function getContrastRatio(color1: string, color2: string): number {
  if (!validateColorHex(color1) || !validateColorHex(color2)) {
    throw new Error("Invalid color format. Colors must be in #RRGGBB format.");
  }

  const lum1 = getRelativeLuminance(color1);
  const lum2 = getRelativeLuminance(color2);

  // Ensure lum1 is the lighter color
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Validates if a color palette has the correct structure
 *
 * Checks that the palette contains:
 * - neutral category with 5 colors
 * - softBlue category with 5 colors
 * - accent category with 4 colors
 * - All colors are valid hex codes
 *
 * @param palette - The palette object to validate
 * @returns true if the palette is valid, false otherwise
 *
 * @example
 * validateColorPalette(colorPalette) // true
 * validateColorPalette({}) // false (missing categories)
 */
export function validateColorPalette(palette: any): boolean {
  // Check if palette is an object
  if (!palette || typeof palette !== "object") {
    return false;
  }

  // Check neutral category
  if (
    !palette.neutral ||
    typeof palette.neutral !== "object" ||
    Object.keys(palette.neutral).length !== 5
  ) {
    return false;
  }

  const neutralColors = Object.values(palette.neutral);
  if (!neutralColors.every((color) => validateColorHex(color as string))) {
    return false;
  }

  // Check softBlue category
  if (
    !palette.softBlue ||
    typeof palette.softBlue !== "object" ||
    Object.keys(palette.softBlue).length !== 5
  ) {
    return false;
  }

  const softBlueColors = Object.values(palette.softBlue);
  if (!softBlueColors.every((color) => validateColorHex(color as string))) {
    return false;
  }

  // Check accent category
  if (
    !palette.accent ||
    typeof palette.accent !== "object" ||
    Object.keys(palette.accent).length !== 4
  ) {
    return false;
  }

  const accentColors = Object.values(palette.accent);
  if (!accentColors.every((color) => validateColorHex(color as string))) {
    return false;
  }

  return true;
}

/**
 * Validates if all colors in the palette meet WCAG AA contrast requirements
 *
 * Checks contrast ratios for common text/background combinations:
 * - Primary text on white background
 * - Secondary text on white background
 * - Primary blue on white background
 *
 * @param palette - The palette object to validate
 * @param tokens - The design tokens object to validate
 * @returns An object with validation results and any failures
 *
 * @example
 * validateWCAGCompliance(colorPalette, designTokens)
 * // { isCompliant: true, failures: [] }
 */
export function validateWCAGCompliance(
  palette: any,
  tokens: any,
): {
  isCompliant: boolean;
  failures: Array<{ combination: string; ratio: number; required: number }>;
} {
  const failures: Array<{
    combination: string;
    ratio: number;
    required: number;
  }> = [];
  const wcagAAMinimum = 4.5;

  // Test combinations
  const testCombinations = [
    {
      name: "Primary text on white",
      color1: tokens.text.primary,
      color2: palette.neutral.white,
    },
    {
      name: "Secondary text on white",
      color1: tokens.text.secondary,
      color2: palette.neutral.white,
    },
    {
      name: "Primary blue on white",
      color1: palette.softBlue.primary,
      color2: palette.neutral.white,
    },
  ];

  for (const combination of testCombinations) {
    try {
      const ratio = getContrastRatio(combination.color1, combination.color2);
      if (ratio < wcagAAMinimum) {
        failures.push({
          combination: combination.name,
          ratio: Math.round(ratio * 100) / 100,
          required: wcagAAMinimum,
        });
      }
    } catch (error) {
      failures.push({
        combination: combination.name,
        ratio: 0,
        required: wcagAAMinimum,
      });
    }
  }

  return {
    isCompliant: failures.length === 0,
    failures,
  };
}

/**
 * Gets a safe color from the palette or returns a fallback
 *
 * @param colorPath - The path to the color in the palette (e.g., "neutral.white")
 * @param fallback - The fallback color to use if the path is invalid
 * @returns The color value or fallback
 *
 * @example
 * getSafeColor("neutral.white") // "#FFFFFF"
 * getSafeColor("invalid.path", "#000000") // "#000000"
 */
export function getSafeColor(
  colorPath: string,
  fallback: string = fallbackColors.primary,
): string {
  try {
    const parts = colorPath.split(".");
    let value: any = colorPalette;

    for (const part of parts) {
      value = value[part];
      if (value === undefined) {
        return fallback;
      }
    }

    if (validateColorHex(value)) {
      return value;
    }
    return fallback;
  } catch (error) {
    return fallback;
  }
}
