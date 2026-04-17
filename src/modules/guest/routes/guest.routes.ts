import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import {
  searchContacts,
  addGuest,
  removeGuest,
  updateGuestPermission,
  getEventGuests,
} from "../controllers/guest.controller";

/**
 * Guest Routes
 *
 * This router handles all guest-related API endpoints for managing guests
 * in calendar events, including searching Google Contacts, adding/removing guests,
 * managing permissions, and retrieving guest lists.
 *
 * All routes require authentication via authMiddleware.
 */
const guestRouter = Router();

/**
 * GET /api/guests/search
 *
 * Search contacts from Google Contacts API
 *
 * Query Parameters:
 * - q (required): Search term to query contacts
 * - limit (optional): Maximum number of results (default: 50, max: 50)
 * - offset (optional): Pagination offset (default: 0)
 *
 * Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "contacts": [
 *       {
 *         "id": "google_contact_id",
 *         "email": "john.doe@example.com",
 *         "name": "John Doe",
 *         "avatar": "https://lh3.googleusercontent.com/...",
 *         "phoneNumbers": ["123-456-7890"]
 *       }
 *     ],
 *     "total": 150,
 *     "limit": 50,
 *     "offset": 0
 *   }
 * }
 *
 * Response (400 Bad Request):
 * {
 *   "success": false,
 *   "error": "Invalid search term"
 * }
 *
 * Response (401 Unauthorized):
 * {
 *   "success": false,
 *   "error": "Google authentication required"
 * }
 *
 * Response (500 Internal Server Error):
 * {
 *   "success": false,
 *   "error": "Failed to search contacts: <details>"
 * }
 *
 * Requirements: 1.1, 1.2, 1.3, 1.5, 8.1, 8.2, 8.3, 8.4
 */
guestRouter.get("/search", authMiddleware, searchContacts);

/**
 * POST /api/guests/add
 *
 * Add a contact as a guest to an event
 *
 * Request Body:
 * {
 *   "eventId": "event_id",
 *   "email": "john.doe@example.com",
 *   "name": "John Doe",
 *   "avatar": "https://lh3.googleusercontent.com/...",
 *   "permission": "view_guest_list"
 * }
 *
 * Response (201 Created):
 * {
 *   "success": true,
 *   "data": {
 *     "guestId": "guest_id",
 *     "eventId": "event_id",
 *     "email": "john.doe@example.com",
 *     "name": "John Doe",
 *     "avatar": "https://lh3.googleusercontent.com/...",
 *     "permission": "view_guest_list",
 *     "createdAt": "2024-01-15T10:30:00Z"
 *   }
 * }
 *
 * Response (400 Bad Request):
 * {
 *   "success": false,
 *   "error": "Invalid email format"
 * }
 *
 * Response (409 Conflict):
 * {
 *   "success": false,
 *   "error": "Guest already added to this event"
 * }
 *
 * Requirements: 3.1, 3.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 9.1, 9.2, 9.3
 */
guestRouter.post("/add", authMiddleware, addGuest);

/**
 * DELETE /api/guests/:guestId
 *
 * Remove a guest from an event
 *
 * Path Parameters:
 * - guestId: The ID of the guest to remove
 *
 * Response (200 OK):
 * {
 *   "success": true,
 *   "message": "Guest removed successfully"
 * }
 *
 * Response (404 Not Found):
 * {
 *   "success": false,
 *   "error": "Guest not found"
 * }
 *
 * Requirements: 5.1, 5.2, 5.3
 */
guestRouter.delete("/:guestId", authMiddleware, removeGuest);

/**
 * PUT /api/guests/:guestId/permission
 *
 * Update a guest's permission level
 *
 * Path Parameters:
 * - guestId: The ID of the guest to update
 *
 * Request Body:
 * {
 *   "permission": "edit_event"
 * }
 *
 * Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "guestId": "guest_id",
 *     "permission": "edit_event",
 *     "updatedAt": "2024-01-15T10:35:00Z"
 *   }
 * }
 *
 * Response (400 Bad Request):
 * {
 *   "success": false,
 *   "error": "Invalid permission value"
 * }
 *
 * Response (404 Not Found):
 * {
 *   "success": false,
 *   "error": "Guest not found"
 * }
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
guestRouter.patch(
  "/:guestId/permission",
  authMiddleware,
  updateGuestPermission,
);

/**
 * GET /api/guests/events/:eventId
 *
 * Retrieve all guests for a specific event
 *
 * Path Parameters:
 * - eventId: The ID of the event
 *
 * Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "guests": [
 *       {
 *         "guestId": "guest_id",
 *         "email": "john.doe@example.com",
 *         "name": "John Doe",
 *         "avatar": "https://lh3.googleusercontent.com/...",
 *         "permission": "view_guest_list",
 *         "addedAt": "2024-01-15T10:30:00Z"
 *       }
 *     ]
 *   }
 * }
 *
 * Response (404 Not Found):
 * {
 *   "success": false,
 *   "error": "Event not found"
 * }
 *
 * Requirements: 3.1, 3.4, 6.1, 6.2, 10.1, 10.2, 10.3, 10.4
 */
guestRouter.get("/events/:eventId", authMiddleware, getEventGuests);

export default guestRouter;
