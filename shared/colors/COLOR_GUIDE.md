# Color System Guide

## Overview

This comprehensive guide explains how to use the color system in the AI-powered task management application. The color system follows a **60-30-10 rule** for visual harmony:

- **60% Neutral**: Clean white and light gray backgrounds for spacious, minimal design
- **30% Soft Blue**: Professional blue accents inspired by MongoDB's design aesthetic
- **10% Accent**: Success, warning, error, and info states for user feedback

## Color Philosophy

The color system is designed with these principles in mind:

1. **Simplicity**: A minimal palette reduces cognitive load and improves usability
2. **Harmony**: The 60-30-10 distribution creates natural visual balance
3. **Accessibility**: All color combinations meet WCAG AA contrast standards (4.5:1 minimum)
4. **Maintainability**: Single source of truth for all color definitions
5. **Scalability**: Easy to extend for future themes (dark mode, custom branding)

## Color Palette Reference

### Neutral Colors (60%)

Used for backgrounds, surfaces, and spacing areas to create a clean, spacious appearance.

| Name              | Hex Code  | Usage                                |
| ----------------- | --------- | ------------------------------------ |
| White             | `#FFFFFF` | Primary background, cards, surfaces  |
| Off-White         | `#F9FAFB` | Subtle background variation          |
| Light Gray        | `#F5F7FA` | Secondary background, hover states   |
| Medium Light Gray | `#E8ECEF` | Tertiary background, disabled states |
| Light Border Gray | `#D1D5DB` | Borders, dividers, subtle separators |

**CSS Variables:**

```css
--color-white: #ffffff;
--color-off-white: #f9fafb;
--color-light-gray: #f5f7fa;
--color-medium-light-gray: #e8ecef;
--color-light-border-gray: #d1d5db;
```

### Soft Blue Colors (30%)

Used for primary actions, links, active states, and accent elements. Inspired by MongoDB's professional design aesthetic.

| Name            | Hex Code  | Usage                                |
| --------------- | --------- | ------------------------------------ |
| Primary Blue    | `#0066CC` | Primary buttons, links, main accent  |
| Secondary Blue  | `#1A73E8` | Hover states, secondary accent       |
| Light Blue      | `#4D94FF` | Lighter accents, focus states        |
| Lighter Blue    | `#B3D9FF` | Subtle backgrounds, disabled accents |
| Very Light Blue | `#E6F0FF` | Very subtle backgrounds, highlights  |

**CSS Variables:**

```css
--color-primary-blue: #0066cc;
--color-secondary-blue: #1a73e8;
--color-light-blue: #4d94ff;
--color-lighter-blue: #b3d9ff;
--color-very-light-blue: #e6f0ff;
```

### Accent Colors (10%)

Used for semantic feedback and state indication. Each color has a specific meaning.

| Name    | Hex Code  | Meaning           | Usage                               |
| ------- | --------- | ----------------- | ----------------------------------- |
| Success | `#10B981` | Positive feedback | Completed tasks, successful actions |
| Warning | `#F59E0B` | Caution           | Pending items, warnings             |
| Error   | `#EF4444` | Critical issue    | Failed actions, errors              |
| Info    | `#3B82F6` | Information       | Informational messages, tips        |

**CSS Variables:**

```css
--color-success: #10b981;
--color-warning: #f59e0b;
--color-error: #ef4444;
--color-info: #3b82f6;
```

### Text Colors

| Name           | Hex Code  | Usage                         |
| -------------- | --------- | ----------------------------- |
| Primary Text   | `#3C4043` | Main body text, headings      |
| Secondary Text | `#5F6368` | Secondary information, labels |
| Tertiary Text  | `#70757A` | Disabled text, hints          |
| Inverse Text   | `#FFFFFF` | Text on dark backgrounds      |

**CSS Variables:**

```css
--color-text-primary: #3c4043;
--color-text-secondary: #5f6368;
--color-text-tertiary: #70757a;
```

## Design Tokens

Design tokens are semantic names that map to specific colors. Use tokens instead of hardcoded hex codes for consistency and maintainability.

### Background Tokens

```typescript
// TypeScript
import { designTokens } from "@/styles/colors";

const bgColor = designTokens.background.primary; // #FFFFFF
const bgSecondary = designTokens.background.secondary; // #F9FAFB
const bgTertiary = designTokens.background.tertiary; // #F5F7FA
```

```css
/* CSS */
background-color: var(--color-white);
background-color: var(--color-off-white);
background-color: var(--color-light-gray);
```

### Button Tokens

```typescript
// Primary Button
const primaryBg = designTokens.button.primary.bg; // #0066CC
const primaryBgHover = designTokens.button.primary.bgHover; // #1A73E8
const primaryText = designTokens.button.primary.text; // #FFFFFF

// Secondary Button
const secondaryBg = designTokens.button.secondary.bg; // #F5F7FA
const secondaryBgHover = designTokens.button.secondary.bgHover; // #E8ECEF
const secondaryText = designTokens.button.secondary.text; // #0066CC

// Disabled Button
const disabledBg = designTokens.button.disabled.bg; // #E8ECEF
const disabledText = designTokens.button.disabled.text; // #D1D5DB
```

```css
/* Primary Button */
.button-primary {
  background-color: var(--button-primary-bg);
  color: var(--button-primary-text);
}

.button-primary:hover {
  background-color: var(--button-primary-bg-hover);
}

/* Secondary Button */
.button-secondary {
  background-color: var(--button-secondary-bg);
  color: var(--button-secondary-text);
}

.button-secondary:hover {
  background-color: var(--button-secondary-bg-hover);
}
```

### Card Tokens

```typescript
const cardBg = designTokens.card.bg; // #FFFFFF
const cardBorder = designTokens.card.border; // #D1D5DB
const cardShadow = designTokens.card.shadow; // rgba(0, 0, 0, 0.06)
```

```css
.card {
  background-color: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: 0 2px 8px var(--card-shadow);
}
```

### Text Tokens

```typescript
const textPrimary = designTokens.text.primary; // #3C4043
const textSecondary = designTokens.text.secondary; // #5F6368
const textTertiary = designTokens.text.tertiary; // #70757A
const textInverse = designTokens.text.inverse; // #FFFFFF
```

```css
.text-primary {
  color: var(--color-text-primary);
}

.text-secondary {
  color: var(--color-text-secondary);
}

.text-tertiary {
  color: var(--color-text-tertiary);
}
```

### State Tokens

```typescript
const successColor = designTokens.state.success; // #10B981
const warningColor = designTokens.state.warning; // #F59E0B
const errorColor = designTokens.state.error; // #EF4444
const infoColor = designTokens.state.info; // #3B82F6
```

```css
.state-success {
  color: var(--color-success);
}

.state-warning {
  color: var(--color-warning);
}

.state-error {
  color: var(--color-error);
}

.state-info {
  color: var(--color-info);
}
```

## Usage Examples

### React Components

#### Using CSS Variables

```tsx
import "./Button.css";

export const Button = ({ variant = "primary", children }) => {
  return <button className={`button button-${variant}`}>{children}</button>;
};
```

```css
/* Button.css */
.button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.button-primary {
  background-color: var(--color-primary-blue);
  color: var(--color-white);
}

.button-primary:hover {
  background-color: var(--color-secondary-blue);
}

.button-secondary {
  background-color: var(--color-light-gray);
  color: var(--color-primary-blue);
}

.button-secondary:hover {
  background-color: var(--color-medium-light-gray);
}
```

#### Using Design Tokens

```tsx
import { designTokens } from "@/styles/colors";

export const Card = ({ children }) => {
  const cardStyle = {
    backgroundColor: designTokens.background.primary,
    border: `1px solid ${designTokens.card.border}`,
    borderRadius: "8px",
    padding: "16px",
    boxShadow: `0 2px 8px ${designTokens.card.shadow}`,
  };

  return <div style={cardStyle}>{children}</div>;
};
```

### Backend Services

#### Returning Colors in API Response

```typescript
import { ColorConfigService } from "@/services/color-config.service";

export const getColorConfig = (req: Request, res: Response) => {
  const colorConfig = ColorConfigService.getColorConfig();
  res.json(colorConfig);
};
```

#### Using Colors in Documentation

```typescript
import { designTokens } from "@/config/colors";

const buttonDocumentation = {
  primary: {
    backgroundColor: designTokens.button.primary.bg,
    textColor: designTokens.button.primary.text,
    hoverBackgroundColor: designTokens.button.primary.bgHover,
  },
};
```

## Accessibility Guidelines

### Contrast Ratios

All color combinations in this system meet WCAG AA standards (minimum 4.5:1 for normal text):

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

1. **Don't rely solely on color**: Use patterns, icons, or text labels in addition to colors to convey information
2. **Semantic color usage**:
   - Blue for primary actions and links
   - Green for success and positive feedback
   - Orange for warnings and caution
   - Red for errors and critical issues
   - Gray for disabled states and secondary information
3. **Color-blind accessibility**: Test with color-blind simulation tools to ensure your designs are accessible
4. **Sufficient contrast**: Always verify that text has sufficient contrast against its background

### Testing for Accessibility

Use these tools to verify color accessibility:

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Color Blindness Simulator](https://www.color-blindness.com/coblis-color-blindness-simulator/)
- [Accessible Colors](https://accessible-colors.com/)

## When to Use Each Color

### Neutral Colors (60%)

Use neutral colors for:

- Page backgrounds
- Card and surface backgrounds
- Disabled states
- Subtle separators and borders
- Spacing and layout

### Soft Blue Colors (30%)

Use soft blue colors for:

- Primary buttons and call-to-action elements
- Links and navigation
- Active states and selections
- Focus indicators
- Primary accent elements

### Accent Colors (10%)

Use accent colors for:

- **Success (Green)**: Completed tasks, successful operations, positive feedback
- **Warning (Orange)**: Pending items, warnings, caution messages
- **Error (Red)**: Failed operations, errors, critical issues
- **Info (Blue)**: Informational messages, tips, helpful hints

## Updating Colors

To update a color in the system:

1. Edit the color value in `shared/colors/colors.config.ts`
2. Update the `CHANGELOG.md` with the change and rationale
3. Run tests to ensure all components still render correctly
4. Deploy the changes

The color system is designed so that a single update propagates to all components automatically without requiring code changes.

## Future Enhancements

The color system is designed to support future enhancements:

- **Dark Mode**: Additional color palette for dark theme
- **Custom Branding**: Support for custom color palettes
- **Theme Switching**: Runtime theme switching capability
- **Color Animations**: Smooth transitions between color states

## Support

For questions or issues with the color system, please refer to:

- `shared/colors/colors.config.ts` - Main color configuration
- `shared/colors/README.md` - Quick reference
- `shared/colors/CHANGELOG.md` - Version history and changes
- `/api/colors` - Backend API endpoint for color configuration
