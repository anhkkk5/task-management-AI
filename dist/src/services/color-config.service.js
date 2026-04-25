"use strict";
/**
 * Color Configuration Service
 *
 * Provides methods to retrieve and manage the color configuration.
 * This service is used by API endpoints and other backend services
 * to access the current color palette and design tokens.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorConfigService = void 0;
const colors_1 = require("../../config/colors");
class ColorConfigService {
    /**
     * Get the current color configuration
     *
     * Returns the complete color configuration including palette, tokens,
     * version information, and last updated timestamp.
     *
     * @returns {ColorConfigResponse} The current color configuration
     */
    static getColorConfig() {
        return {
            palette: colors_1.colorPalette,
            tokens: colors_1.designTokens,
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
        return colors_1.colorPalette;
    }
    /**
     * Get only the design tokens
     *
     * @returns {typeof designTokens} The design tokens
     */
    static getTokens() {
        return colors_1.designTokens;
    }
    /**
     * Get the version of the color system
     *
     * @returns {string} The version string
     */
    static getVersion() {
        return "1.0.0";
    }
}
exports.ColorConfigService = ColorConfigService;
