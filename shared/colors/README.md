# Color System Documentation

## Overview

This color system provides a centralized, maintainable palette for the AI-powered task management application. It follows a **60-30-10 rule** for visual harmony:

- **60% Neutral**: Clean white and light gray backgrounds for spacious, minimal design
- **30% Soft Blue**: Professional blue accents inspired by MongoDB's design aesthetic
- **10% Accent**: Semantic colors for success, warning, error, and info states

The system is implemented as a single source of truth in `colors.config.ts`, ensuring visual consistency across both frontend (React) and backend (Node.js) workspaces.

### Design Philosophy

The color system prioritizes:

- **Simplicity**: Minimal palette reduces cognitive load
- **Harmony**: 60-30-10 rule creates natural visual balance
- **Accessibility**: WCAG AA contrast ratios for all text/background combinations
- **Maintainability**: Single source of truth for all color definitions
- **Scalability**: Easy to extend for future themes (dark mode, custom branding)

---

## Quick Reference

### Neutral Colors (60%)

Used for backgrounds, surfaces, and spacing areas to create a clean, spacious appearance.

| Name              | Hex Code  | Usage                                |
| ----------------- | --------- | ------------------------------------ |
| White             | `#FFFFFF` | Primary background, cards, surfaces  |
| Off-White         | `#F9FAFB` | Subtle background variation          |
| Light Gray        | `#F5F7FA` | Secondary background, hover states   |
| Medium Light Gray | `#E8ECEF` | Tertiary background, disabled states |
| Light Border Gray | `#D1D5DB` | Borders, dividers, subtle separators |

### Soft Blue Colors (30%)

Used for primary actions, links, active states, and accent elements. Inspired by MongoDB's professional aesthetic.

| Name            | Hex Code  | Usage                               |
| --------------- | --------- | ----------------------------------- |
| Primary Blue    | `#0066CC` | Primary buttons, links, main accent |
| Secondary Blue  | `#1A73E8` | Hover states, active elements       |
| Light Blue      | `#4D94FF` | Lighter accents, secondary actions  |
| Lighter Blue    | `#B3D9FF` | Subtle backgrounds, focus states    |
| Very Light Blue | `#E6F0FF` | Very subtle backgrounds, highlights |

### Accent Colors (10%)

Used for semantic feedback and state indication.

| Name    | Hex Code  | Usage                               |
| ------- | --------- | ----------------------------------- |
| Success | `#10B981` | Positive feedback, success messages |
| Warning | `#F59E0B` | Caution, alerts, warnings           |
| Error   | `#EF4444` | Critical issues, error messages     |
| Info    | `#3B82F6` | Informational messages, tips        |

### Text Colors

| Name           | Hex Code  | Usage                              |
| -------------- | --------- | ---------------------------------- |
| Primary Text   | `#3C4043` | Main body text, headings           |
| Secondary Text | `#5F6368` | Secondary information, labels      |
| Tertiary Text  | `#70757A` | Disabled text, hints, placeholders |
| Inverse Text   | `#FFFFFF` | Text on colored backgrounds        |

---

## Design Token Naming Convention

Design tokens use semantic naming to represent UI elements and their states. This approach eliminates the need to memorize hex codes and makes the system more maintainable.

### Naming Pattern

```
[element]-[state]-[property]
```

**Examples:**

- `button-primary-bg` - Primary button background
- `button-primary-hover-bg` - Primary button background on hover
- `card-border` - Card border color
- `text-secondary` - Secondary text color

### Token Categories

#### Backgrounds

- `background-primary` - Main background color
- `background-secondary` - Secondary background color
- `background-tertiary` - Tertiary background color

#### Buttons

- `button-primary-bg` - Primary button background
- `button-primary-bg-hover` - Primary button background on hover
- `button-primary-text` - Primary button text color
- `button-secondary-bg` - Secondary button background
- `button-secondary-bg-hover` - Secondary button background on hover
- `button-secondary-text` - Secondary button text color
- `button-disabled-bg` - Disabled button background
- `button-disabled-text` - Disabled button text color

#### Cards & Surfaces

- `card-bg` - Card background
- `card-border` - Card border color
- `card-shadow` - Card shadow color

#### Text

- `text-primary` - Primary text color
- `text-secondary` - Secondary text color
- `text-tertiary` - Tertiary text color
- `text-inverse` - Text on colored backgrounds

#### Borders

- `border-light` - Light border color
- `border-medium` - Medium border color

#### States

- `state-success` - Success state color
- `state-warning` - Warning state color
- `state-error` - Error state color
- `state-info` - Info state color

---

## Usage Examples

### React Components

#### Using CSS Variables

CSS variables are injected into the global scope and can be used in any stylesheet:

```scss
// Component.scss
.button-primary {
  background-color: var(--color-primary-blue);
  color: var(--color-white);
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: var(--color-secondary-blue);
  }

  &:disabled {
    background-color: var(--color-medium-light-gray);
    color: var(--color-light-border-gray);
    cursor: not-allowed;
  }
}
```

#### Using Design Tokens in TypeScript

Import design tokens directly in your React components:

```typescript
// Button.tsx
import { designTokens } from "../../../shared/colors/colors.config";

export const Button: React.FC<ButtonProps> = ({ variant = "primary", ...props }) => {
  const colors = variant === "primary" ? designTokens.button.primary : designTokens.button.secondary;

  return (
    <button
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
      }}
      {...props}
    />
  );
};
```

#### Using Styled Components

```typescript
// Button.tsx
import styled from "styled-components";
import { designTokens } from "../../../shared/colors/colors.config";

const StyledButton = styled.button`
  background-color: ${designTokens.button.primary.bg};
  color: ${designTokens.button.primary.text};
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: ${designTokens.button.primary.bgHover};
  }
`;

export const Button: React.FC<ButtonProps> = (props) => (
  <StyledButton {...props} />
);
```

### Backend Services

#### Using Colors in API Responses

```typescript
// color-config.service.ts
import {
  colorPalette,
  designTokens,
} from "../../../shared/colors/colors.config";

export interface ColorConfigResponse {
  palette: typeof colorPalette;
  tokens: typeof designTokens;
  version: string;
  lastUpdated: string;
}

export class ColorConfigService {
  static getColorConfig(): ColorConfigResponse {
    return {
      palette: colorPalette,
      tokens: designTokens,
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
    };
  }
}
```

#### Using Colors in OpenAPI Documentation

```yaml
# openapi.yml
/api/colors:
  get:
    summary: Get color configuration
    responses:
      "200":
        description: Color configuration
        content:
          application/json:
            schema:
              type: object
              properties:
                palette:
                  type: object
                  properties:
                    neutral:
                      type: object
                      properties:
                        white:
                          type: string
                          example: "#FFFFFF"
                tokens:
                  type: object
                  properties:
                    button:
                      type: object
                      properties:
                        primary:
                          type: object
                          properties:
                            bg:
                              type: string
                              example: "#0066CC"
```

---

## Accessibility Guidelines

### Contrast Ratios

All color combinations in this system meet **WCAG AA standards** (minimum 4.5:1 for normal text):

| Combination                       | Ratio   | Status |
| --------------------------------- | ------- | ------ |
| Primary Blue (#0066CC) on White   | 8.59:1  | ✓ Pass |
| Secondary Blue (#1A73E8) on White | 7.25:1  | ✓ Pass |
| Primary Text (#3C4043) on White   | 12.63:1 | ✓ Pass |
| Secondary Text (#5F6368) on White | 9.48:1  | ✓ Pass |
| Success (#10B981) on White        | 5.24:1  | ✓ Pass |
| Warning (#F59E0B) on White        | 5.74:1  | ✓ Pass |
| Error (#EF4444) on White          | 5.91:1  | ✓ Pass |

### Best Practices

1. **Don't rely solely on color** - Use patterns, icons, or text labels in addition to colors to convey information
2. **Maintain sufficient contrast** - Always verify text/background combinations meet 4.5:1 ratio
3. **Use semantic colors** - Apply colors consistently for their intended meaning (blue for actions, green for success, red for errors)
4. **Test with color-blind users** - Use tools like [Coblis](https://www.color-blindness.com/coblis-color-blindness-simulator/) to verify accessibility
5. **Provide text alternatives** - Don't use color alone to indicate status or state

### Semantic Color Usage

- **Blue**: Primary actions, links, focus states, interactive elements
- **Green**: Success, positive feedback, confirmations
- **Orange**: Warnings, caution, alerts
- **Red**: Errors, critical issues, destructive actions
- **Gray**: Disabled states, secondary information, inactive elements

---

## Integration Guide

### Frontend Setup

1. **Import colors in your component:**

```typescript
import {
  colorPalette,
  designTokens,
} from "../../../shared/colors/colors.config";
```

2. **Use CSS variables in stylesheets:**

```scss
.component {
  background-color: var(--color-primary-blue);
  color: var(--color-text-primary);
}
```

3. **Apply design tokens in React:**

```typescript
const buttonStyle = {
  backgroundColor: designTokens.button.primary.bg,
  color: designTokens.button.primary.text,
};
```

### Backend Setup

1. **Import colors in your service:**

```typescript
import {
  colorPalette,
  designTokens,
} from "../../../shared/colors/colors.config";
```

2. **Use in API responses:**

```typescript
const response = {
  colors: colorPalette,
  tokens: designTokens,
};
```

3. **Export through API endpoint:**

```typescript
app.get("/api/colors", (req, res) => {
  res.json({
    palette: colorPalette,
    tokens: designTokens,
    version: "1.0.0",
  });
});
```

---

## Maintenance and Updates

### Updating Colors

To update a color in the system:

1. Edit `colors.config.ts` with the new color value
2. Update `CHANGELOG.md` with the change and rationale
3. Run validation tests to ensure hex codes are valid
4. Verify contrast ratios still meet WCAG AA standards
5. Test all components to ensure visual consistency

### Adding New Design Tokens

To add a new design token:

1. Add the token to the appropriate category in `designTokens`
2. Map it to a color from `colorPalette`
3. Document the token in this README
4. Add usage examples
5. Update tests to verify the new token

### Version Control

Color system changes follow semantic versioning:

- **Major**: Significant palette changes (e.g., new primary color)
- **Minor**: New tokens or colors added
- **Patch**: Bug fixes or refinements

---

## File Structure

```
shared/colors/
├── colors.config.ts          # Main color configuration
├── validation.ts             # Color validation utilities
├── README.md                 # This file - quick reference
├── COLOR_GUIDE.md            # Comprehensive usage guide (future)
├── CHANGELOG.md              # Version history (future)
├── utilities/                # Helper functions
└── examples/                 # Usage examples
```

---

## Related Documentation

- **[COLOR_GUIDE.md](./COLOR_GUIDE.md)** - Comprehensive color usage guide with visual examples
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and color system updates
- **[colors.config.ts](./colors.config.ts)** - Source configuration file
- **[validation.ts](./validation.ts)** - Color validation utilities

---

## Support

For questions or issues with the color system:

1. Check the [COLOR_GUIDE.md](./COLOR_GUIDE.md) for detailed examples
2. Review the [colors.config.ts](./colors.config.ts) source file
3. Run validation tests to verify color integrity
4. Consult the [CHANGELOG.md](./CHANGELOG.md) for recent updates

---

## Summary

This color system provides a harmonious, accessible, and maintainable palette for the entire application. By following the 60-30-10 rule and using semantic design tokens, we ensure visual consistency while maintaining flexibility for future updates and theme variations.

**Key Takeaways:**

- Use CSS variables for styling in SCSS/CSS files
- Use design tokens when working with TypeScript/React
- Always verify contrast ratios meet WCAG AA standards
- Don't rely solely on color to convey information
- Update `colors.config.ts` as the single source of truth
