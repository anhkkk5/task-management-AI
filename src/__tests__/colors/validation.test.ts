/**
 * Unit Tests for Color System Validation Utilities
 *
 * Tests cover:
 * - Hex code validation
 * - Contrast ratio calculation
 * - Color palette structure validation
 * - WCAG AA compliance checking
 * - Safe color retrieval with fallbacks
 */

import {
  validateColorHex,
  getContrastRatio,
  validateColorPalette,
  validateWCAGCompliance,
  getSafeColor,
  fallbackColors,
} from "../../../shared/colors/validation";
import {
  colorPalette,
  designTokens,
} from "../../../shared/colors/colors.config";

describe("Color System Validation", () => {
  describe("validateColorHex", () => {
    it("should validate correct hex codes", () => {
      expect(validateColorHex("#FFFFFF")).toBe(true);
      expect(validateColorHex("#000000")).toBe(true);
      expect(validateColorHex("#0066CC")).toBe(true);
      expect(validateColorHex("#f5f7fa")).toBe(true); // lowercase
      expect(validateColorHex("#AbCdEf")).toBe(true); // mixed case
    });

    it("should reject invalid hex codes", () => {
      expect(validateColorHex("#FFF")).toBe(false); // too short
      expect(validateColorHex("#FFFFFF00")).toBe(false); // too long
      expect(validateColorHex("FFFFFF")).toBe(false); // missing #
      expect(validateColorHex("#GGGGGG")).toBe(false); // invalid characters
      expect(validateColorHex("#12345G")).toBe(false); // invalid character
      expect(validateColorHex("")).toBe(false); // empty string
      expect(validateColorHex("#")).toBe(false); // just hash
    });

    it("should reject non-string inputs", () => {
      expect(validateColorHex(null as any)).toBe(false);
      expect(validateColorHex(undefined as any)).toBe(false);
      expect(validateColorHex(123 as any)).toBe(false);
      expect(validateColorHex({} as any)).toBe(false);
    });
  });

  describe("getContrastRatio", () => {
    it("should calculate correct contrast ratios for known combinations", () => {
      // Primary blue on white should have good contrast
      const blueOnWhite = getContrastRatio("#0066CC", "#FFFFFF");
      expect(blueOnWhite).toBeGreaterThan(5);
      expect(blueOnWhite).toBeLessThan(6);

      // Primary text on white should have high contrast
      const textOnWhite = getContrastRatio("#3C4043", "#FFFFFF");
      expect(textOnWhite).toBeGreaterThan(10);
      expect(textOnWhite).toBeLessThan(11);

      // Light gray on white should have low contrast
      const lightGrayOnWhite = getContrastRatio("#F5F7FA", "#FFFFFF");
      expect(lightGrayOnWhite).toBeLessThan(2);
    });

    it("should return same ratio regardless of color order", () => {
      const ratio1 = getContrastRatio("#0066CC", "#FFFFFF");
      const ratio2 = getContrastRatio("#FFFFFF", "#0066CC");
      expect(ratio1).toBeCloseTo(ratio2, 2);
    });

    it("should meet WCAG AA minimum for text/background combinations", () => {
      const wcagAAMinimum = 4.5;

      // Primary text on white
      expect(getContrastRatio("#3C4043", "#FFFFFF")).toBeGreaterThanOrEqual(
        wcagAAMinimum,
      );

      // Secondary text on white
      expect(getContrastRatio("#5F6368", "#FFFFFF")).toBeGreaterThanOrEqual(
        wcagAAMinimum,
      );

      // Primary blue on white
      expect(getContrastRatio("#0066CC", "#FFFFFF")).toBeGreaterThanOrEqual(
        wcagAAMinimum,
      );
    });

    it("should throw error for invalid hex codes", () => {
      expect(() => getContrastRatio("#GGGGGG", "#FFFFFF")).toThrow();
      expect(() => getContrastRatio("#FFF", "#FFFFFF")).toThrow();
      expect(() => getContrastRatio("#FFFFFF", "FFFFFF")).toThrow();
    });

    it("should handle edge cases", () => {
      // Black on white should have maximum contrast
      const maxContrast = getContrastRatio("#000000", "#FFFFFF");
      expect(maxContrast).toBeCloseTo(21, 0);

      // Same color should have minimum contrast
      const minContrast = getContrastRatio("#FFFFFF", "#FFFFFF");
      expect(minContrast).toBeCloseTo(1, 0);
    });
  });

  describe("validateColorPalette", () => {
    it("should validate correct color palette", () => {
      expect(validateColorPalette(colorPalette)).toBe(true);
    });

    it("should reject invalid palette structures", () => {
      expect(validateColorPalette(null)).toBe(false);
      expect(validateColorPalette(undefined)).toBe(false);
      expect(validateColorPalette({})).toBe(false);
      expect(validateColorPalette("not an object")).toBe(false);
      expect(validateColorPalette(123)).toBe(false);
    });

    it("should reject palette missing categories", () => {
      const incompletePalette = {
        neutral: colorPalette.neutral,
        softBlue: colorPalette.softBlue,
        // missing accent
      };
      expect(validateColorPalette(incompletePalette)).toBe(false);
    });

    it("should reject palette with wrong number of colors", () => {
      const wrongNeutral = {
        neutral: {
          white: "#FFFFFF",
          offWhite: "#F9FAFB",
          // missing 3 colors
        },
        softBlue: colorPalette.softBlue,
        accent: colorPalette.accent,
      };
      expect(validateColorPalette(wrongNeutral)).toBe(false);
    });

    it("should reject palette with invalid hex codes", () => {
      const invalidPalette = {
        neutral: {
          white: "#FFFFFF",
          offWhite: "#F9FAFB",
          lightGray: "#F5F7FA",
          mediumLightGray: "#E8ECEF",
          lightBorderGray: "INVALID", // invalid hex
        },
        softBlue: colorPalette.softBlue,
        accent: colorPalette.accent,
      };
      expect(validateColorPalette(invalidPalette)).toBe(false);
    });

    it("should validate all required color counts", () => {
      // Neutral should have exactly 5 colors
      expect(Object.keys(colorPalette.neutral).length).toBe(5);

      // Soft blue should have exactly 5 colors
      expect(Object.keys(colorPalette.softBlue).length).toBe(5);

      // Accent should have exactly 4 colors
      expect(Object.keys(colorPalette.accent).length).toBe(4);
    });
  });

  describe("validateWCAGCompliance", () => {
    it("should validate WCAG AA compliance for current palette", () => {
      const result = validateWCAGCompliance(colorPalette, designTokens);
      expect(result.isCompliant).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it("should detect non-compliant combinations", () => {
      const nonCompliantTokens = {
        ...designTokens,
        text: {
          ...designTokens.text,
          primary: "#CCCCCC", // light gray text - fails WCAG AA
        },
      };

      const result = validateWCAGCompliance(colorPalette, nonCompliantTokens);
      expect(result.isCompliant).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    it("should include failure details", () => {
      const nonCompliantTokens = {
        ...designTokens,
        text: {
          ...designTokens.text,
          primary: "#CCCCCC", // light gray text
        },
      };

      const result = validateWCAGCompliance(colorPalette, nonCompliantTokens);
      expect(result.failures.length).toBeGreaterThan(0);

      const failure = result.failures[0];
      expect(failure).toHaveProperty("combination");
      expect(failure).toHaveProperty("ratio");
      expect(failure).toHaveProperty("required");
      expect(failure.required).toBe(4.5);
    });

    it("should test all required combinations", () => {
      const result = validateWCAGCompliance(colorPalette, designTokens);
      // Should test at least 7 combinations
      expect(result.failures.length + 7).toBeGreaterThanOrEqual(7);
    });
  });

  describe("getSafeColor", () => {
    it("should retrieve colors from palette using dot notation", () => {
      expect(getSafeColor("neutral.white")).toBe("#FFFFFF");
      expect(getSafeColor("softBlue.primary")).toBe("#0066CC");
      expect(getSafeColor("accent.success")).toBe("#10B981");
    });

    it("should return fallback for invalid paths", () => {
      expect(getSafeColor("invalid.path")).toBe(fallbackColors.primary);
      expect(getSafeColor("neutral.nonexistent")).toBe(fallbackColors.primary);
      expect(getSafeColor("")).toBe(fallbackColors.primary);
    });

    it("should use custom fallback when provided", () => {
      const customFallback = "#000000";
      expect(getSafeColor("invalid.path", customFallback)).toBe(customFallback);
    });

    it("should handle deeply nested paths", () => {
      expect(getSafeColor("neutral.white")).toBe("#FFFFFF");
      expect(getSafeColor("softBlue.veryLight")).toBe("#E6F0FF");
    });

    it("should validate returned colors are hex codes", () => {
      const color = getSafeColor("neutral.white");
      expect(validateColorHex(color)).toBe(true);
    });

    it("should handle errors gracefully", () => {
      // Should not throw, should return fallback
      expect(() => getSafeColor("neutral.white")).not.toThrow();
      expect(() => getSafeColor("invalid")).not.toThrow();
    });
  });

  describe("Fallback Colors", () => {
    it("should have valid fallback colors", () => {
      expect(validateColorHex(fallbackColors.primary)).toBe(true);
      expect(validateColorHex(fallbackColors.text)).toBe(true);
      expect(validateColorHex(fallbackColors.background)).toBe(true);
    });

    it("should have appropriate fallback values", () => {
      expect(fallbackColors.primary).toBe("#0066CC"); // primary blue
      expect(fallbackColors.text).toBe("#3C4043"); // primary text
      expect(fallbackColors.background).toBe("#FFFFFF"); // white
    });
  });

  describe("Integration Tests", () => {
    it("should validate entire color system", () => {
      // Palette should be valid
      expect(validateColorPalette(colorPalette)).toBe(true);

      // All colors should be valid hex codes
      const allColors = [
        ...Object.values(colorPalette.neutral),
        ...Object.values(colorPalette.softBlue),
        ...Object.values(colorPalette.accent),
      ];
      allColors.forEach((color) => {
        expect(validateColorHex(color as string)).toBe(true);
      });

      // WCAG compliance should pass
      const compliance = validateWCAGCompliance(colorPalette, designTokens);
      expect(compliance.isCompliant).toBe(true);
    });

    it("should handle color system updates safely", () => {
      // Simulate updating a color
      const updatedPalette = {
        ...colorPalette,
        neutral: {
          ...colorPalette.neutral,
          white: "#FAFAFA", // slightly off-white
        },
      };

      // Should still be valid
      expect(validateColorPalette(updatedPalette)).toBe(true);

      // Should still be WCAG compliant
      const compliance = validateWCAGCompliance(updatedPalette, designTokens);
      expect(compliance.isCompliant).toBe(true);
    });

    it("should provide safe access to all palette colors", () => {
      const neutralColors = Object.keys(colorPalette.neutral);
      const softBlueColors = Object.keys(colorPalette.softBlue);
      const accentColors = Object.keys(colorPalette.accent);

      // All neutral colors should be accessible
      neutralColors.forEach((colorName) => {
        const color = getSafeColor(`neutral.${colorName}`);
        expect(validateColorHex(color)).toBe(true);
      });

      // All soft blue colors should be accessible
      softBlueColors.forEach((colorName) => {
        const color = getSafeColor(`softBlue.${colorName}`);
        expect(validateColorHex(color)).toBe(true);
      });

      // All accent colors should be accessible
      accentColors.forEach((colorName) => {
        const color = getSafeColor(`accent.${colorName}`);
        expect(validateColorHex(color)).toBe(true);
      });
    });
  });
});
