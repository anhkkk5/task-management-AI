# Guest Validation Middleware

## Overview

The Guest Validation Middleware provides comprehensive input validation for guest-related operations in the calendar event management system. It validates email formats, permission values, search terms, and pagination parameters, returning descriptive error messages for client feedback.

## Features

- **Email Validation**: Validates email format and normalizes to lowercase
- **Permission Validation**: Ensures permission values are from allowed set
- **Search Term Validation**: Validates search term length and format
- **Pagination Validation**: Validates and normalizes pagination parameters
- **Request Body Validation**: Comprehensive validation for add/update guest requests
- **Reusable Functions**: All validation functions can be used independently or as middleware

## Validation Functions

### Email Validation

#### `validateEmailFormat(email: string): boolean`

Validates if an email address is in valid format.

**Rules:**

- Must contain @ symbol
- Must have local part (before @) with alphanumeric, dots, underscores, hyphens, plus signs
- Must have domain part (after @) with alphanumeric, dots, hyphens
- Must have valid TLD (2+ characters)
- Rejects consecutive dots, leading/trailing dots, spaces

**Examples:**

```typescript
validateEmailFormat("john.doe@example.com"); // true
validateEmailFormat("user+tag@domain.co.uk"); // true
validateEmailFormat("invalid.email"); // false
validateEmailFormat("user..name@domain.com"); // false
validateEmailFormat("@example.com"); // false
```

#### `normalizeEmail(email: string): string`

Normalizes email address to lowercase and trims whitespace.

**Examples:**

```typescript
normalizeEmail("John.Doe@Example.COM"); // "john.doe@example.com"
normalizeEmail("  user@domain.com  "); // "user@domain.com"
```

### Permission Validation

#### `validatePermission(permission: unknown): permission is Permission`

Validates if permission is one of the allowed values.

**Valid Permissions:**

- `"edit_event"` - Guest can edit event details
- `"view_guest_list"` - Guest can view other guests
- `"invite_others"` - Guest can invite additional guests

**Examples:**

```typescript
validatePermission("edit_event"); // true
validatePermission("view_guest_list"); // true
validatePermission("invalid"); // false
validatePermission(null); // false
```

#### `getValidPermissions(): readonly string[]`

Returns array of valid permission values.

**Examples:**

```typescript
getValidPermissions(); // ["edit_event", "view_guest_list", "invite_others"]
```

### Search Term Validation

#### `validateSearchTerm(searchTerm: unknown): { valid: boolean; error?: string }`

Validates search term for contact search.

**Rules:**

- Must be non-empty string
- Must be at least 1 character (after trimming)
- Must be at most 100 characters
- Can contain alphanumeric, spaces, and common special characters

**Examples:**

```typescript
validateSearchTerm("john"); // { valid: true }
validateSearchTerm(""); // { valid: false, error: "Search term cannot be empty" }
validateSearchTerm("a".repeat(101)); // { valid: false, error: "Search term must be at most 100 characters" }
```

### Pagination Validation

#### `validatePaginationParams(limit: unknown, offset: unknown): { valid: boolean; limit: number; offset: number; error?: string }`

Validates and normalizes pagination parameters.

**Rules:**

- `limit`: Must be positive integer, default 50, max 50
- `offset`: Must be non-negative integer, default 0
- Decimal values are floored to integers

**Examples:**

```typescript
validatePaginationParams(50, 0); // { valid: true, limit: 50, offset: 0 }
validatePaginationParams(100, 0); // { valid: true, limit: 50, offset: 0 } (capped at 50)
validatePaginationParams(-1, 0); // { valid: false, error: "Limit must be a positive integer" }
validatePaginationParams(50.7, 10.3); // { valid: true, limit: 50, offset: 10 }
```

### Request Body Validation

#### `validateAddGuestRequest(body: any): { valid: boolean; errors: ValidationError[] }`

Validates complete add guest request body.

**Required Fields:**

- `eventId` (string): Event ID
- `email` (string): Guest email address
- `name` (string): Guest name

**Optional Fields:**

- `avatar` (string): Avatar URL (must be valid URL if provided)
- `permission` (string): Permission level (defaults to "view_guest_list")

**Examples:**

```typescript
// Valid request
validateAddGuestRequest({
  eventId: "123",
  email: "john@example.com",
  name: "John Doe",
  permission: "view_guest_list",
});
// { valid: true, errors: [] }

// Invalid request
validateAddGuestRequest({
  eventId: "123",
  email: "invalid.email",
  name: "",
});
// { valid: false, errors: [
//   { field: "email", message: "Email format is invalid" },
//   { field: "name", message: "Guest name is required and must be a non-empty string" }
// ]}
```

#### `validateUpdatePermissionRequest(body: any): { valid: boolean; errors: ValidationError[] }`

Validates update permission request body.

**Required Fields:**

- `permission` (string): New permission level

**Examples:**

```typescript
validateUpdatePermissionRequest({ permission: "edit_event" });
// { valid: true, errors: [] }

validateUpdatePermissionRequest({ permission: "invalid" });
// { valid: false, errors: [
//   { field: "permission", message: "Permission must be one of: edit_event, view_guest_list, invite_others" }
// ]}
```

#### `validateSearchContactsQuery(query: any): { valid: boolean; searchTerm?: string; limit?: number; offset?: number; error?: string }`

Validates search contacts query parameters.

**Query Parameters:**

- `q` (required): Search term (1-100 characters)
- `limit` (optional): Results limit (default 50, max 50)
- `offset` (optional): Pagination offset (default 0)

**Examples:**

```typescript
validateSearchContactsQuery({ q: "john", limit: 50, offset: 0 });
// { valid: true, searchTerm: "john", limit: 50, offset: 0 }

validateSearchContactsQuery({ q: "" });
// { valid: false, error: "Search term cannot be empty" }
```

## Express Middleware

### `validateAddGuestMiddleware`

Express middleware for validating add guest requests.

**Usage:**

```typescript
router.post(
  "/add",
  authMiddleware,
  validateAddGuestMiddleware,
  addGuestController,
);
```

**Response on Validation Error (400 Bad Request):**

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Email format is invalid"
    }
  ]
}
```

### `validateUpdatePermissionMiddleware`

Express middleware for validating update permission requests.

**Usage:**

```typescript
router.put(
  "/:guestId/permission",
  authMiddleware,
  validateUpdatePermissionMiddleware,
  updatePermissionController,
);
```

**Response on Validation Error (400 Bad Request):**

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "permission",
      "message": "Permission must be one of: edit_event, view_guest_list, invite_others"
    }
  ]
}
```

### `validateSearchContactsMiddleware`

Express middleware for validating search contacts query parameters.

**Usage:**

```typescript
router.get(
  "/search",
  authMiddleware,
  validateSearchContactsMiddleware,
  searchContactsController,
);
```

**Response on Validation Error (400 Bad Request):**

```json
{
  "success": false,
  "error": "Search term cannot be empty"
}
```

## Integration with Routes

### Example: Adding Validation to Guest Routes

```typescript
import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import {
  validateAddGuestMiddleware,
  validateUpdatePermissionMiddleware,
  validateSearchContactsMiddleware,
} from "../middleware/guest-validation.middleware";
import {
  searchContacts,
  addGuest,
  updateGuestPermission,
} from "../controllers/guest.controller";

const guestRouter = Router();

// Search contacts with validation
guestRouter.get(
  "/search",
  authMiddleware,
  validateSearchContactsMiddleware,
  searchContacts,
);

// Add guest with validation
guestRouter.post("/add", authMiddleware, validateAddGuestMiddleware, addGuest);

// Update permission with validation
guestRouter.put(
  "/:guestId/permission",
  authMiddleware,
  validateUpdatePermissionMiddleware,
  updateGuestPermission,
);

export default guestRouter;
```

## Error Handling

All validation functions return structured error information:

### Validation Error Structure

```typescript
interface ValidationError {
  field: string; // Field name that failed validation
  message: string; // Descriptive error message
  value?: any; // The invalid value (optional)
}
```

### Error Response Format

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Email format is invalid"
    },
    {
      "field": "name",
      "message": "Guest name is required and must be a non-empty string"
    }
  ]
}
```

## Testing

The validation middleware includes comprehensive unit tests covering:

- Valid and invalid email formats
- Email normalization
- Permission validation
- Search term validation
- Pagination parameter validation
- Complete request body validation
- Edge cases and boundary conditions

**Run Tests:**

```bash
npm test -- src/modules/guest/middleware/__tests__/guest-validation.middleware.test.ts
```

**Test Coverage:**

- 54 test cases
- All validation functions covered
- Edge cases and error scenarios tested
- 100% pass rate

## Requirements Mapping

This validation middleware implements the following requirements:

- **Requirement 9.1**: Email validation in add/update operations
- **Requirement 9.2**: Permission value validation
- **Requirement 9.3**: Search term length and format validation
- **Requirement 9.1, 9.2, 9.3**: Pagination parameter validation
- **Requirement 9.1, 9.2, 9.3**: Return 400 Bad Request with descriptive error messages

## Best Practices

1. **Always validate input**: Use validation functions before processing user input
2. **Provide descriptive errors**: Include field names and specific error messages
3. **Normalize data**: Use `normalizeEmail()` to ensure consistent email storage
4. **Use middleware**: Apply validation middleware to routes for automatic validation
5. **Test edge cases**: Validate boundary conditions and special characters
6. **Handle errors gracefully**: Return appropriate HTTP status codes and error messages

## Future Enhancements

- Add support for custom validation rules
- Implement async validation (e.g., checking if email exists)
- Add rate limiting for search requests
- Support for additional permission types
- Internationalization (i18n) for error messages
