/**
 * Color Configuration Service
 *
 * Provides methods to retrieve and manage the color configuration.
 * This service is used by API endpoints and other backend services
 * to access the current color palette and design tokens.
 */

import {
  colorPalette,
  designTokens,
  ColorConfigResponse,
} from "../../config/colors";

export class ColorConfigService {
  /**
   * Get the current color configuration
   *
   * Returns the complete color configuration including palette, tokens,
   * version information, and last updated timestamp.
   *
   * @returns {ColorConfigResponse} The current color configuration
   */
  static getColorConfig(): ColorConfigResponse {
    return {
      palette: colorPalette,
      tokens: designTokens,
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get only the color palette
   *
   * @returns {typeof colorPalette} The color palette
   */
  static getPalette() {
    return colorPalette;
  }

  /**
   * Get only the design tokens
   *
   * @returns {typeof designTokens} The design tokens
   */
  static getTokens() {
    return designTokens;
  }

  /**
   * Get the version of the color system
   *
   * @returns {string} The version string
   */
  static getVersion(): string {
    return "1.0.0";
  }
}
