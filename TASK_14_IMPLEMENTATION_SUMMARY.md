# Task 14: Update Event API to include guests - Implementation Summary

## Overview

Task 14 implements support for persisting and retrieving guest information with events in the Event API. The infrastructure was already in place, but required fixes to ensure guest details are properly handled in create and update operations.

## Changes Made

### 1. Task Repository (`src/modules/task/task.repository.ts`)

**Issue**: The `create` method was not including `guestDetails` when creating tasks.
**Fix**: Added `guestDetails: attrs.guestDetails ?? []` to the create method.

**Issue**: The `updateById` and `updateByIdForUser` methods expected `guestId` as string but the model uses ObjectId.
**Fix**: Updated type signatures to accept `guestId: string | Types.ObjectId` to support both formats.

### 2. Task Service (`src/modules/task/task.service.ts`)

**Issue**: The `create` method was not passing `guestDetails` to the repository.
**Fix**: Added `guestDetails: dto.guestDetails` to the repository.create call.

**Issue**: The `create` and `update` methods were not converting `guestId` strings to ObjectId.
**Fix**: Added conversion logic to transform `guestDetails` guestId strings to ObjectId before persisting:

```typescript
const guestDetails = dto.guestDetails
  ? dto.guestDetails.map((g) => ({
      guestId: new Types.ObjectId(g.guestId),
      email: g.email,
      name: g.name,
      avatar: g.avatar,
      permission: g.permission,
      status: g.status,
    }))
  : undefined;
```

### 3. Task Controller (`src/modules/task/task.controller.ts`)

**Issue**: The `createTask` function was not parsing `guestDetails` from the request body.
**Fix**: Added parsing of `guestDetails` using the existing `parseGuestDetails` function and passed it to `taskService.create`.

**Note**: The `updateTask` function already had proper support for `guestDetails`.

### 4. Tests (`src/modules/task/__tests__/task.guest-details.test.ts`)

Created comprehensive test suite with 14 tests covering:

- Guest details DTO validation
- Support for all permission types (edit_event, view_guest_list, invite_others)
- Support for all status types (pending, accepted, declined)
- Optional avatar field handling
- Empty and undefined guest details
- Guest details in different task types (event, appointment, todo)
- Update scenarios (adding, updating, clearing guests)

All tests pass successfully.

## API Endpoints

### PUT /api/tasks/:id (Update Event with Guests)

**Request Body**:

```json
{
  "title": "Team Meeting",
  "type": "event",
  "guestDetails": [
    {
      "guestId": "507f1f77bcf86cd799439011",
      "email": "john@example.com",
      "name": "John Doe",
      "avatar": "https://example.com/avatar.jpg",
      "permission": "edit_event",
      "status": "pending"
    }
  ]
}
```

**Response (200 OK)**:

```json
{
  "task": {
    "id": "507f1f77bcf86cd799439012",
    "title": "Team Meeting",
    "type": "event",
    "guestDetails": [
      {
        "guestId": "507f1f77bcf86cd799439011",
        "email": "john@example.com",
        "name": "John Doe",
        "avatar": "https://example.com/avatar.jpg",
        "permission": "edit_event",
        "status": "pending"
      }
    ],
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:35:00Z"
  }
}
```

### GET /api/tasks/:id (Get Event with Guests)

**Response (200 OK)**:

```json
{
  "task": {
    "id": "507f1f77bcf86cd799439012",
    "title": "Team Meeting",
    "type": "event",
    "guestDetails": [
      {
        "guestId": "507f1f77bcf86cd799439011",
        "email": "john@example.com",
        "name": "John Doe",
        "avatar": "https://example.com/avatar.jpg",
        "permission": "edit_event",
        "status": "pending"
      }
    ],
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:35:00Z"
  }
}
```

## Data Model

### Guest Summary in Task

```typescript
type GuestSummary = {
  guestId: Types.ObjectId; // Reference to Guest document
  email: string; // Guest email (normalized to lowercase)
  name: string; // Guest name
  avatar?: string; // URL to guest avatar image
  permission: "edit_event" | "view_guest_list" | "invite_others";
  status?: "pending" | "accepted" | "declined";
};
```

### Task Model Update

The Task model now includes:

- `guests: string[]` - Legacy field for simple email strings
- `guestDetails: GuestSummary[]` - New field for detailed guest information with permissions

## Backward Compatibility

- The implementation maintains backward compatibility with existing tasks that don't have guest details
- The `guests` array field is still supported for legacy email-only guest lists
- The `guestDetails` field is optional and can be undefined

## Requirements Validation

### Requirement 3.4: Guest Addition Persistence

✅ When a guest is added to an event, the guest information (email, name, avatar, permission) is persisted to the database via the `guestDetails` field.

### Requirement 4.4: Guest Permission Persistence

✅ When guest permissions are updated, the changes are persisted to the database and retrieved correctly.

### Requirement 6.1: Guest Information Storage

✅ Guest email, name, and avatar URL are stored in the database as part of the task document.

### Requirement 6.2: Guest Information Retrieval

✅ When an event is loaded, all guests associated with that event are retrieved with their complete information.

### Requirement 6.3: Guest Information Update

✅ Guest information can be updated and the changes are persisted to the database.

### Requirement 6.4: Guest Information Deletion

✅ Guests can be removed from an event by updating the guestDetails array.

## Testing

- Build: ✅ Successful (no TypeScript errors)
- Unit Tests: ✅ 14/14 tests passing
- Integration: ✅ Guest details properly persisted and retrieved

## Files Modified

1. `src/modules/task/task.repository.ts` - Added guestDetails support to create and update methods
2. `src/modules/task/task.service.ts` - Added guestDetails conversion and passing to repository
3. `src/modules/task/task.controller.ts` - Added guestDetails parsing in createTask
4. `src/modules/task/__tests__/task.guest-details.test.ts` - New test file with 14 tests

## Notes

- The implementation uses the existing infrastructure for guest management
- Guest details are embedded in the task document for quick access without separate queries
- The guestId field references the Guest collection for detailed guest information
- All guest-related endpoints in the guest module continue to work as expected
