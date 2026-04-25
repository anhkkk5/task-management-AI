"use strict";
/**
 * Color Configuration Routes
 *
 * Provides API endpoints for retrieving the color configuration.
 * These endpoints are used by frontend clients to fetch the current
 * color palette and design tokens.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const color_config_service_1 = require("../../services/color-config.service");
const router = (0, express_1.Router)();
/**
 * GET /api/colors
 *
 * Returns the complete color configuration including palette, tokens,
 * version information, and last updated timestamp.
 *
 * Response includes:
 * - palette: Color palette organized by role (neutral, softBlue, accent)
 * - tokens: Design tokens for UI elements
 * - version: Color system version
 * - lastUpdated: ISO timestamp of last update
 *
 * @returns {ColorConfigResponse} The current color configuration
 */
router.get("/", (_req, res) => {
    try {
        const colorConfig = color_config_service_1.ColorConfigService.getColorConfig();
        res.set("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
        res.json(colorConfig);
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to retrieve color configuration",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
/**
 * GET /api/colors/palette
 *
 * Returns only the color palette without design tokens.
 * Useful for clients that only need the raw color values.
 *
 * @returns {ColorPalette} The color palette
 */
router.get("/palette", (_req, res) => {
    try {
        const palette = color_config_service_1.ColorConfigService.getPalette();
        res.set("Cache-Control", "public, max-age=3600");
        res.json(palette);
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to retrieve color palette",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
/**
 * GET /api/colors/tokens
 *
 * Returns only the design tokens without the raw palette.
 * Useful for clients that only need semantic token names.
 *
 * @returns {DesignTokens} The design tokens
 */
router.get("/tokens", (_req, res) => {
    try {
        const tokens = color_config_service_1.ColorConfigService.getTokens();
        res.set("Cache-Control", "public, max-age=3600");
        res.json(tokens);
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to retrieve design tokens",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
/**
 * GET /api/colors/version
 *
 * Returns the version of the color system.
 * Useful for clients to check if they have the latest color configuration.
 *
 * @returns {Object} Version information
 */
router.get("/version", (_req, res) => {
    try {
        const version = color_config_service_1.ColorConfigService.getVersion();
        res.set("Cache-Control", "public, max-age=3600");
        res.json({ version });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to retrieve version",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
exports.default = router;
