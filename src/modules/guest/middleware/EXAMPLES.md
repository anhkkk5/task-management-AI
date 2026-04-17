# Guest Validation Middleware - Usage Examples

## Quick Start

### Using Validation Functions

```typescript
import {
  validateEmailFormat,
  normalizeEmail,
  validatePermission,
  validateSearchTerm,
  validatePaginationParams,
  validateAddGuestRequest,
  validateUpdatePermissionRequest,
  validateSearchContactsQuery,
} from "../middleware/guest-validation.middleware";

// Example 1: Validate email
const email = "john.doe@example.com";
if (validateEmailFormat(email)) {
  const normalized = normalizeEmail(email);
  console.log(normalized); // "john.doe@example.com"
}

// Example 2: Validate permission
if (validatePermission("edit_event")) {
  console.log("Permission is valid");
}

// Example 3: Validate search term
const searchResult = validateSearchTerm("john");
if (searchResult.valid) {
  console.log("Search term is valid");
} else {
  console.log("Error:", searchResult.error);
}

// Example 4: Validate pagination
const paginationResult = validatePaginationParams(100, 0);
console.log(paginationResult);
// { valid: true, limit: 50, offset: 0 } (limit capped at 50)

// Example 5: Validate add guest request
const addGuestResult = validateAddGuestRequest({
  eventId: "123",
  email: "john@example.com",
  name: "John Doe",
  permission: "view_guest_list",
});

if (addGuestResult.valid) {
  console.log("Request is valid");
} else {
  console.log("Validation errors:", addGuestResult.errors);
}
```

## Using Express Middleware

### In Routes

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

## Real-World Examples

### Example 1: Email Validation in Service

```typescript
import {
  validateEmailFormat,
  normalizeEmail,
} from "../middleware/guest-validation.middleware";

export class GuestService {
  async addGuest(
    eventId: string,
    userId: string,
    email: string,
    name: string,
    avatar?: string,
    permission:
      | "edit_event"
      | "view_guest_list"
      | "invite_others" = "view_guest_list",
  ) {
    // Validate email format
    if (!validateEmailFormat(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // Check for duplicate
    const existingGuest = await Guest.findOne({
      eventId,
      email: normalizedEmail,
    });

    if (existingGuest) {
      throw new Error(`Guest with email ${normalizedEmail} already added`);
    }

    // Create guest
    const guest = await Guest.create({
      eventId,
      userId,
      email: normalizedEmail,
      name: name.trim(),
      avatar: avatar?.trim(),
      permission,
      status: "pending",
    });

    return guest;
  }
}
```

### Example 2: Permission Validation in Controller

```typescript
import {
  validatePermission,
  getValidPermissions,
} from "../middleware/guest-validation.middleware";

export const updateGuestPermission = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { permission } = req.body;

    // Validate permission
    if (!validatePermission(permission)) {
      res.status(400).json({
        success: false,
        error: `Invalid permission. Must be one of: ${getValidPermissions().join(", ")}`,
      });
      return;
    }

    // Update guest permission
    const guest = await guestService.updateGuestPermission(
      req.params.guestId,
      permission,
    );

    res.status(200).json({
      success: true,
      data: {
        guestId: guest._id,
        permission: guest.permission,
        updatedAt: guest.updatedAt,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to update guest permission",
    });
  }
};
```

### Example 3: Search Validation in Controller

```typescript
import { validateSearchContactsQuery } from "../middleware/guest-validation.middleware";

export const searchContacts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    // Validate search query
    const validation = validateSearchContactsQuery(req.query);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.error,
      });
      return;
    }

    // Search contacts
    const contacts = await contactSearchService.searchContacts(
      userId,
      validation.searchTerm!,
      validation.limit!,
      validation.offset!,
    );

    res.status(200).json({
      success: true,
      data: {
        contacts,
        total: contacts.length,
        limit: validation.limit,
        offset: validation.offset,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to search contacts",
    });
  }
};
```

## API Request Examples

### Example 1: Valid Search Request

**Request:**

```bash
curl -X GET "http://localhost:3000/api/guests/search?q=john&limit=50&offset=0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "contacts": [
      {
        "id": "google_contact_id_1",
        "email": "john.doe@example.com",
        "name": "John Doe",
        "avatar": "https://lh3.googleusercontent.com/...",
        "phoneNumbers": ["123-456-7890"]
      },
      {
        "id": "google_contact_id_2",
        "email": "john.smith@example.com",
        "name": "John Smith",
        "avatar": "https://lh3.googleusercontent.com/...",
        "phoneNumbers": ["098-765-4321"]
      }
    ],
    "total": 2,
    "limit": 50,
    "offset": 0
  }
}
```

### Example 2: Invalid Search Request (Empty Search Term)

**Request:**

```bash
curl -X GET "http://localhost:3000/api/guests/search?limit=50&offset=0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (400 Bad Request):**

```json
{
  "success": false,
  "error": "Search term cannot be empty"
}
```

### Example 3: Valid Add Guest Request

**Request:**

```bash
curl -X POST "http://localhost:3000/api/guests/add" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "507f1f77bcf86cd799439011",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "avatar": "https://lh3.googleusercontent.com/...",
    "permission": "view_guest_list"
  }'
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "guestId": "507f1f77bcf86cd799439012",
    "eventId": "507f1f77bcf86cd799439011",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "avatar": "https://lh3.googleusercontent.com/...",
    "permission": "view_guest_list",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Example 4: Invalid Add Guest Request (Invalid Email)

**Request:**

```bash
curl -X POST "http://localhost:3000/api/guests/add" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "507f1f77bcf86cd799439011",
    "email": "invalid.email",
    "name": "John Doe",
    "permission": "view_guest_list"
  }'
```

**Response (400 Bad Request):**

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

### Example 5: Invalid Add Guest Request (Multiple Errors)

**Request:**

```bash
curl -X POST "http://localhost:3000/api/guests/add" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "",
    "email": "invalid.email",
    "name": "",
    "permission": "invalid_permission"
  }'
```

**Response (400 Bad Request):**

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "eventId",
      "message": "Event ID is required and must be a non-empty string"
    },
    {
      "field": "email",
      "message": "Email format is invalid"
    },
    {
      "field": "name",
      "message": "Guest name is required and must be a non-empty string"
    },
    {
      "field": "permission",
      "message": "Permission must be one of: edit_event, view_guest_list, invite_others"
    }
  ]
}
```

### Example 6: Valid Update Permission Request

**Request:**

```bash
curl -X PUT "http://localhost:3000/api/guests/507f1f77bcf86cd799439012/permission" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{ "permission": "edit_event" }'
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "guestId": "507f1f77bcf86cd799439012",
    "permission": "edit_event",
    "updatedAt": "2024-01-15T10:35:00Z"
  }
}
```

### Example 7: Invalid Update Permission Request

**Request:**

```bash
curl -X PUT "http://localhost:3000/api/guests/507f1f77bcf86cd799439012/permission" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{ "permission": "invalid_permission" }'
```

**Response (400 Bad Request):**

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

## Testing Examples

### Unit Test Example

```typescript
import {
  validateEmailFormat,
  validatePermission,
  validateAddGuestRequest,
} from "../middleware/guest-validation.middleware";

describe("Guest Validation", () => {
  it("should validate email format", () => {
    expect(validateEmailFormat("john@example.com")).toBe(true);
    expect(validateEmailFormat("invalid.email")).toBe(false);
  });

  it("should validate permission", () => {
    expect(validatePermission("edit_event")).toBe(true);
    expect(validatePermission("invalid")).toBe(false);
  });

  it("should validate add guest request", () => {
    const result = validateAddGuestRequest({
      eventId: "123",
      email: "john@example.com",
      name: "John Doe",
      permission: "view_guest_list",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
```

### Integration Test Example

```typescript
import request from "supertest";
import app from "../../../app";

describe("Guest API with Validation", () => {
  it("should reject invalid email in add guest request", async () => {
    const response = await request(app)
      .post("/api/guests/add")
      .set("Authorization", `Bearer ${token}`)
      .send({
        eventId: "123",
        email: "invalid.email",
        name: "John Doe",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.details).toContainEqual(
      expect.objectContaining({
        field: "email",
        message: expect.stringContaining("invalid"),
      }),
    );
  });

  it("should accept valid add guest request", async () => {
    const response = await request(app)
      .post("/api/guests/add")
      .set("Authorization", `Bearer ${token}`)
      .send({
        eventId: "123",
        email: "john@example.com",
        name: "John Doe",
        permission: "view_guest_list",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe("john@example.com");
  });
});
```

## Common Validation Scenarios

### Scenario 1: Email with Special Characters

```typescript
// Valid emails with special characters
validateEmailFormat("user+tag@example.com"); // true
validateEmailFormat("user_name@example.com"); // true
validateEmailFormat("user-name@example.com"); // true
validateEmailFormat("user.name@example.com"); // true

// Invalid emails with special characters
validateEmailFormat("user..name@example.com"); // false (consecutive dots)
validateEmailFormat(".user@example.com"); // false (leading dot)
validateEmailFormat("user.@example.com"); // false (trailing dot)
```

### Scenario 2: Pagination Edge Cases

```typescript
// Default values
validatePaginationParams(undefined, undefined);
// { valid: true, limit: 50, offset: 0 }

// Capping limit
validatePaginationParams(100, 0);
// { valid: true, limit: 50, offset: 0 }

// Flooring decimals
validatePaginationParams(50.7, 10.3);
// { valid: true, limit: 50, offset: 10 }

// Invalid values
validatePaginationParams(-1, 0);
// { valid: false, error: "Limit must be a positive integer" }
```

### Scenario 3: Search Term Edge Cases

```typescript
// Valid search terms
validateSearchTerm("a"); // { valid: true }
validateSearchTerm("john doe"); // { valid: true }
validateSearchTerm("a".repeat(100)); // { valid: true }

// Invalid search terms
validateSearchTerm(""); // { valid: false, error: "..." }
validateSearchTerm("   "); // { valid: false, error: "..." }
validateSearchTerm("a".repeat(101)); // { valid: false, error: "..." }
```

## Troubleshooting

### Issue: Email validation too strict

**Solution:** Check if email has consecutive dots or leading/trailing dots:

```typescript
// These will fail
validateEmailFormat("user..name@example.com"); // false
validateEmailFormat(".user@example.com"); // false
validateEmailFormat("user.@example.com"); // false

// These will pass
validateEmailFormat("user.name@example.com"); // true
validateEmailFormat("user+tag@example.com"); // true
```

### Issue: Permission validation failing

**Solution:** Ensure permission is exactly one of the allowed values:

```typescript
// Valid
validatePermission("edit_event"); // true
validatePermission("view_guest_list"); // true
validatePermission("invite_others"); // true

// Invalid (case-sensitive)
validatePermission("Edit_Event"); // false
validatePermission("EDIT_EVENT"); // false
```

### Issue: Pagination not working as expected

**Solution:** Remember that limit is capped at 50:

```typescript
// Limit will be capped
validatePaginationParams(100, 0);
// { valid: true, limit: 50, offset: 0 }

// Use smaller limit
validatePaginationParams(25, 0);
// { valid: true, limit: 25, offset: 0 }
```

## References

- [Validation Middleware Documentation](./VALIDATION.md)
- [Integration Guide](./INTEGRATION_GUIDE.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
