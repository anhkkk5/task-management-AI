/**
 * Backend Color Configuration
 * Re-exports shared color palette for backend services
 */
export { colorPalette, designTokens } from "../shared/colors/colors.config";

export interface ColorConfigResponse {
  palette: {
    neutral: Record<string, string>;
    softBlue: Record<string, string>;
    accent: Record<string, string>;
  };
  tokens: Record<string, unknown>;
  version: string;
  lastUpdated: string;
}

export class ColorConfigService {
  static getColorConfig(): ColorConfigResponse {
    const {
      colorPalette,
      designTokens,
    } = require("../shared/colors/colors.config");
    return {
      palette: colorPalette,
      tokens: designTokens,
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
    };
  }
}
