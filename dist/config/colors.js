"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorConfigService = exports.designTokens = exports.colorPalette = void 0;
/**
 * Backend Color Configuration
 * Re-exports shared color palette for backend services
 */
var colors_config_1 = require("../shared/colors/colors.config");
Object.defineProperty(exports, "colorPalette", { enumerable: true, get: function () { return colors_config_1.colorPalette; } });
Object.defineProperty(exports, "designTokens", { enumerable: true, get: function () { return colors_config_1.designTokens; } });
class ColorConfigService {
    static getColorConfig() {
        const { colorPalette, designTokens, } = require("../shared/colors/colors.config");
        return {
            palette: colorPalette,
            tokens: designTokens,
            version: "1.0.0",
            lastUpdated: new Date().toISOString(),
        };
    }
}
exports.ColorConfigService = ColorConfigService;
