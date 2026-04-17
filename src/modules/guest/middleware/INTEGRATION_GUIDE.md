# Guest Validation Middleware - Integration Guide

## Overview

This guide explains how to integrate the guest validation middleware into the existing guest routes to add input validation for all guest-related API endpoints.

## Current State

The guest routes currently have validation logic embedded in the controllers. This guide shows how to extract that validation into reusable middleware for better separation of concerns.

## Integration Steps

### Step 1: Update Guest Routes

Update `src/modules/guest/routes/guest.routes.ts` to include the validation middleware:

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
  removeGuest,
  updateGuestPermission,
  getEventGuests,
} from "../controllers/guest.controller";

const guestRouter = Router();

/**
 * GET /api/guests/search
 * Search contacts from Google Contacts API
 * Validates: search term (q), limit, offset
 */
guestRouter.get(
  "/search",
  authMiddleware,
  validateSearchContactsMiddleware,
  searchContacts,
);

/**
 * POST /api/guests/add
 * Add a contact as a guest to an event
 * Validates: eventId, email, name, avatar (optional), permission (optional)
 */
guestRouter.post("/add", authMiddleware, validateAddGuestMiddleware, addGuest);

/**
 * DELETE /api/guests/:guestId
 * Remove a guest from an event
 */
guestRouter.delete("/:guestId", authMiddleware, removeGuest);

/**
 * PUT /api/guests/:guestId/permission
 * Update a guest's permission level
 * Validates: permission
 */
guestRouter.put(
  "/:guestId/permission",
  authMiddleware,
  validateUpdatePermissionMiddleware,
  updateGuestPermission,
);

/**
 * GET /api/guests/events/:eventId
 * Retrieve all guests for a specific event
 */
guestRouter.get("/events/:eventId", authMiddleware, getEventGuests);

export default guestRouter;
```

### Step 2: Simplify Controller Logic

With validation middleware in place, the controller can be simplified by removing redundant validation:

**Before (with validation in controller):**

```typescript
export const addGuest = async (_req: Request, res: Response): Promise<void> => {
  try {
    // ... validation logic ...
    const eventId = String(_req.body?.eventId ?? "").trim();
    if (!eventId) {
      res.status(400).json({
        success: false,
        error: "Event ID không hợp lệ",
      });
      return;
    }
    // ... more validation ...
  } catch (err) {
    // ... error handling ...
  }
};
```

**After (with middleware validation):**

```typescript
export const addGuest = async (_req: Request, res: Response): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Chưa đăng nhập",
      });
      return;
    }

    // Validation already done by middleware
    const { eventId, email, name, avatar, permission } = _req.body;

    // Add guest to event
    const guest = await guestService.addGuest(
      eventId,
      userId,
      email,
      name,
      avatar,
      permission || "view_guest_list",
    );

    res.status(201).json({
      success: true,
      data: {
        guestId: guest._id,
        eventId: guest.eventId,
        email: guest.email,
        name: guest.name,
        avatar: guest.avatar,
        permission: guest.permission,
        createdAt: guest.createdAt,
      },
    });
  } catch (err) {
    // ... error handling ...
  }
};
```

## Validation Middleware Behavior

### Search Contacts Validation

**Endpoint:** `GET /api/guests/search?q=john&limit=50&offset=0`

**Validation Rules:**

- `q` (required): Search term, 1-100 characters
- `limit` (optional): Positive integer, default 50, max 50
- `offset` (optional): Non-negative integer, default 0

**Error Response (400 Bad Request):**

```json
{
  "success": false,
  "error": "Search term cannot be empty"
}
```

### Add Guest Validation

**Endpoint:** `POST /api/guests/add`

**Request Body:**

```json
{
  "eventId": "123",
  "email": "john@example.com",
  "name": "John Doe",
  "avatar": "https://example.com/avatar.jpg",
  "permission": "view_guest_list"
}
```

**Validation Rules:**

- `eventId` (required): Non-empty string
- `email` (required): Valid email format
- `name` (required): Non-empty string
- `avatar` (optional): Valid URL if provided
- `permission` (optional): One of "edit_event", "view_guest_list", "invite_others"

**Error Response (400 Bad Request):**

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

### Update Permission Validation

**Endpoint:** `PUT /api/guests/:guestId/permission`

**Request Body:**

```json
{
  "permission": "edit_event"
}
```

**Validation Rules:**

- `permission` (required): One of "edit_event", "view_guest_list", "invite_others"

**Error Response (400 Bad Request):**

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

## Using Validation Functions Independently

The validation functions can also be used independently in services or other parts of the application:

```typescript
import {
  validateEmailFormat,
  normalizeEmail,
  validatePermission,
  validateSearchTerm,
  validatePaginationParams,
} from "../middleware/guest-validation.middleware";

// In a service
export class GuestService {
  async addGuest(email: string, name: string, permission: string) {
    // Validate email
    if (!validateEmailFormat(email)) {
      throw new Error("Invalid email format");
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // Validate permission
    if (!validatePermission(permission)) {
      throw new Error("Invalid permission");
    }

    // ... rest of logic ...
  }
}
```

## Testing the Integration

### Test Search Contacts Endpoint

```bash
# Valid request
curl -X GET "http://localhost:3000/api/guests/search?q=john&limit=50&offset=0" \
  -H "Authorization: Bearer <token>"

# Invalid request (missing search term)
curl -X GET "http://localhost:3000/api/guests/search?limit=50&offset=0" \
  -H "Authorization: Bearer <token>"
# Response: 400 Bad Request
# { "success": false, "error": "Search term cannot be empty" }
```

### Test Add Guest Endpoint

```bash
# Valid request
curl -X POST "http://localhost:3000/api/guests/add" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "123",
    "email": "john@example.com",
    "name": "John Doe",
    "permission": "view_guest_list"
  }'

# Invalid request (invalid email)
curl -X POST "http://localhost:3000/api/guests/add" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "123",
    "email": "invalid.email",
    "name": "John Doe"
  }'
# Response: 400 Bad Request
# {
#   "success": false,
#   "error": "Validation failed",
#   "details": [
#     {
#       "field": "email",
#       "message": "Email format is invalid"
#     }
#   ]
# }
```

### Test Update Permission Endpoint

```bash
# Valid request
curl -X PUT "http://localhost:3000/api/guests/123/permission" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "permission": "edit_event" }'

# Invalid request (invalid permission)
curl -X PUT "http://localhost:3000/api/guests/123/permission" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "permission": "invalid_permission" }'
# Response: 400 Bad Request
# {
#   "success": false,
#   "error": "Validation failed",
#   "details": [
#     {
#       "field": "permission",
#       "message": "Permission must be one of: edit_event, view_guest_list, invite_others"
#     }
#   ]
# }
```

## Benefits of This Approach

1. **Separation of Concerns**: Validation logic is separated from business logic
2. **Reusability**: Validation functions can be used in multiple places
3. **Consistency**: All endpoints use the same validation rules
4. **Maintainability**: Validation rules are centralized and easy to update
5. **Testability**: Validation functions are independently testable
6. **Cleaner Controllers**: Controllers focus on business logic, not validation
7. **Better Error Messages**: Consistent, descriptive error messages for all endpoints

## Migration Checklist

- [ ] Review current validation logic in controllers
- [ ] Update guest routes to include validation middleware
- [ ] Simplify controller logic by removing redundant validation
- [ ] Run existing tests to ensure no regressions
- [ ] Add integration tests for validation middleware
- [ ] Update API documentation with validation rules
- [ ] Deploy and monitor for any issues

## Troubleshooting

### Validation Middleware Not Applied

**Issue**: Validation middleware is not being applied to routes

**Solution**: Ensure middleware is imported and applied in the correct order:

```typescript
// Correct order: auth -> validation -> controller
router.post("/add", authMiddleware, validateAddGuestMiddleware, addGuest);

// Incorrect order: validation before auth
router.post("/add", validateAddGuestMiddleware, authMiddleware, addGuest);
```

### Validation Errors Not Returned

**Issue**: Validation errors are not being returned to client

**Solution**: Ensure middleware is returning response before calling `next()`:

```typescript
// Correct: return response on validation error
if (!validation.valid) {
  res.status(400).json({ error: "Validation failed" });
  return; // Important: return to prevent calling next()
}
next();
```

### Email Validation Too Strict

**Issue**: Valid emails are being rejected

**Solution**: Check email format against validation rules:

- Must have @ symbol
- Must have local part and domain
- Must have valid TLD (2+ characters)
- No consecutive dots

Example valid emails:

- `john.doe@example.com`
- `user+tag@domain.co.uk`
- `test_email@test-domain.com`

## References

- [Validation Middleware Documentation](./VALIDATION.md)
- [Guest Module Architecture](../README.md)
- [Express Middleware Guide](https://expressjs.com/en/guide/using-middleware.html)
