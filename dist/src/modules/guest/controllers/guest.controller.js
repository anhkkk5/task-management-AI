"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEventGuests = exports.updateGuestPermission = exports.removeGuest = exports.addGuest = exports.searchContacts = void 0;
const guest_service_1 = require("../services/guest.service");
const contact_search_service_1 = require("../services/contact-search.service");
const guest_repository_1 = require("../repositories/guest.repository");
/**
 * Parse permission value from request
 * Validates that permission is one of the allowed values
 *
 * @private
 * @param value - The permission value to parse
 * @returns Permission type or undefined if invalid
 */
const parsePermission = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const v = String(value);
    if (v === "edit_event" || v === "view_guest_list" || v === "invite_others")
        return v;
    return undefined;
};
/**
 * Parse positive integer from request
 * Used for pagination parameters (limit, offset)
 *
 * @private
 * @param value - The value to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Positive integer or default value
 */
const parsePositiveInt = (value, defaultValue) => {
    if (value === undefined || value === null)
        return defaultValue;
    const n = Number(value);
    if (!Number.isFinite(n))
        return defaultValue;
    const x = Math.floor(n);
    if (x <= 0)
        return defaultValue;
    return x;
};
/**
 * Search contacts from Google Contacts API
 * Endpoint: GET /api/guests/search?q=<search_term>&limit=50&offset=0
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
 * @param _req - Express request object
 * @param res - Express response object
 */
const searchContacts = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({
                success: false,
                error: "Chưa đăng nhập",
            });
            return;
        }
        const searchTerm = String(_req.query?.q ?? "").trim();
        if (!searchTerm) {
            res.status(400).json({
                success: false,
                error: "Vui lòng nhập từ khóa tìm kiếm",
            });
            return;
        }
        const limit = Math.min(parsePositiveInt(_req.query?.limit, 50), 50);
        const offset = parsePositiveInt(_req.query?.offset, 0);
        // Search contacts using Google Contacts API
        const contacts = await contact_search_service_1.contactSearchService.searchContacts(userId, searchTerm, limit, offset);
        res.status(200).json({
            success: true,
            data: {
                contacts,
                total: contacts.length,
                limit,
                offset,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        // Handle authentication errors
        if (message.includes("Google authentication") ||
            message.includes("authentication required")) {
            res.status(401).json({
                success: false,
                error: "Cần xác thực Google. Vui lòng kết nối tài khoản Google của bạn.",
            });
            return;
        }
        // Handle rate limit errors
        if (message.includes("Too many requests")) {
            res.status(429).json({
                success: false,
                error: "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
            });
            return;
        }
        // Handle service unavailable errors
        if (message.includes("temporarily unavailable")) {
            res.status(503).json({
                success: false,
                error: "Dịch vụ Google Contacts tạm thời không khả dụng. Vui lòng thử lại sau.",
            });
            return;
        }
        // Handle network errors
        if (message.includes("Network error") || message.includes("timeout")) {
            res.status(503).json({
                success: false,
                error: "Lỗi kết nối. Vui lòng kiểm tra kết nối internet của bạn.",
            });
            return;
        }
        // Handle generic errors
        res.status(500).json({
            success: false,
            error: "Lỗi tìm kiếm liên hệ",
            ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
        });
    }
};
exports.searchContacts = searchContacts;
/**
 * Add a guest to an event
 * Endpoint: POST /api/guests/add
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
 * @param _req - Express request object
 * @param res - Express response object
 */
const addGuest = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({
                success: false,
                error: "Chưa đăng nhập",
            });
            return;
        }
        // Validate required fields
        const eventId = String(_req.body?.eventId ?? "").trim();
        if (!eventId) {
            res.status(400).json({
                success: false,
                error: "Event ID không hợp lệ",
            });
            return;
        }
        const email = String(_req.body?.email ?? "").trim();
        if (!email) {
            res.status(400).json({
                success: false,
                error: "Email không hợp lệ",
            });
            return;
        }
        const name = String(_req.body?.name ?? "").trim();
        if (!name) {
            res.status(400).json({
                success: false,
                error: "Tên khách không hợp lệ",
            });
            return;
        }
        const avatar = _req.body?.avatar !== undefined
            ? String(_req.body.avatar).trim()
            : undefined;
        const permission = parsePermission(_req.body?.permission);
        const finalPermission = permission || "view_guest_list";
        // Add guest to event
        const guest = await guest_service_1.guestService.addGuest(eventId, userId, email, name, avatar, finalPermission);
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
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        // Handle invalid email format
        if (message.includes("Invalid email")) {
            res.status(400).json({
                success: false,
                error: "Định dạng email không hợp lệ",
            });
            return;
        }
        // Handle duplicate guest
        if (message.includes("already added")) {
            res.status(409).json({
                success: false,
                error: "Khách này đã được thêm vào sự kiện",
            });
            return;
        }
        // Handle duplicate key error from database
        if (message.includes("Duplicate")) {
            res.status(409).json({
                success: false,
                error: "Khách này đã được thêm vào sự kiện",
            });
            return;
        }
        // Handle validation errors
        if (message.includes("Validation error")) {
            res.status(400).json({
                success: false,
                error: "Dữ liệu khách không hợp lệ",
            });
            return;
        }
        // Handle generic errors
        res.status(500).json({
            success: false,
            error: "Lỗi thêm khách",
            ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
        });
    }
};
exports.addGuest = addGuest;
/**
 * Remove a guest from an event
 * Endpoint: DELETE /api/guests/:guestId
 *
 * URL Parameters:
 * - guestId (required): The guest ID to remove
 *
 * Response (200 OK):
 * {
 *   "success": true,
 *   "message": "Khách đã được xóa thành công"
 * }
 *
 * @param _req - Express request object
 * @param res - Express response object
 */
const removeGuest = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({
                success: false,
                error: "Chưa đăng nhập",
            });
            return;
        }
        const guestId = String(_req.params?.guestId ?? "").trim();
        if (!guestId) {
            res.status(400).json({
                success: false,
                error: "Guest ID không hợp lệ",
            });
            return;
        }
        // Verify guest exists and belongs to user's event
        const guest = await guest_repository_1.guestRepository.findById(guestId);
        if (!guest) {
            res.status(404).json({
                success: false,
                error: "Khách không tìm thấy",
            });
            return;
        }
        // Remove guest
        await guest_service_1.guestService.removeGuest(guestId);
        res.status(200).json({
            success: true,
            message: "Khách đã được xóa thành công",
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        // Handle guest not found
        if (message.includes("not found")) {
            res.status(404).json({
                success: false,
                error: "Khách không tìm thấy",
            });
            return;
        }
        // Handle invalid ID format
        if (message.includes("Invalid ID")) {
            res.status(400).json({
                success: false,
                error: "Guest ID không hợp lệ",
            });
            return;
        }
        // Handle generic errors
        res.status(500).json({
            success: false,
            error: "Lỗi xóa khách",
            ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
        });
    }
};
exports.removeGuest = removeGuest;
/**
 * Update guest permission level
 * Endpoint: PUT /api/guests/:guestId/permission
 *
 * URL Parameters:
 * - guestId (required): The guest ID to update
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
 * @param _req - Express request object
 * @param res - Express response object
 */
const updateGuestPermission = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({
                success: false,
                error: "Chưa đăng nhập",
            });
            return;
        }
        const guestId = String(_req.params?.guestId ?? "").trim();
        if (!guestId) {
            res.status(400).json({
                success: false,
                error: "Guest ID không hợp lệ",
            });
            return;
        }
        const permissionRaw = _req.body?.permission;
        const permission = parsePermission(permissionRaw);
        if (!permission) {
            res.status(400).json({
                success: false,
                error: "Quyền không hợp lệ. Phải là: edit_event, view_guest_list, invite_others",
            });
            return;
        }
        // Update guest permission
        const guest = await guest_service_1.guestService.updateGuestPermission(guestId, permission);
        res.status(200).json({
            success: true,
            data: {
                guestId: guest._id,
                permission: guest.permission,
                updatedAt: guest.updatedAt,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        // Handle guest not found
        if (message.includes("not found")) {
            res.status(404).json({
                success: false,
                error: "Khách không tìm thấy",
            });
            return;
        }
        // Handle invalid ID format
        if (message.includes("Invalid ID")) {
            res.status(400).json({
                success: false,
                error: "Guest ID không hợp lệ",
            });
            return;
        }
        // Handle validation errors
        if (message.includes("Validation error")) {
            res.status(400).json({
                success: false,
                error: "Dữ liệu quyền không hợp lệ",
            });
            return;
        }
        // Handle generic errors
        res.status(500).json({
            success: false,
            error: "Lỗi cập nhật quyền khách",
            ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
        });
    }
};
exports.updateGuestPermission = updateGuestPermission;
/**
 * Get all guests for an event
 * Endpoint: GET /api/events/:eventId/guests
 *
 * URL Parameters:
 * - eventId (required): The event ID to get guests for
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
 * @param _req - Express request object
 * @param res - Express response object
 */
const getEventGuests = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({
                success: false,
                error: "Chưa đăng nhập",
            });
            return;
        }
        const eventId = String(_req.params?.eventId ?? "").trim();
        if (!eventId) {
            res.status(400).json({
                success: false,
                error: "Event ID không hợp lệ",
            });
            return;
        }
        // Get all guests for the event
        const guests = await guest_service_1.guestService.getEventGuests(eventId);
        // Format response
        const formattedGuests = guests.map((guest) => ({
            guestId: guest._id,
            email: guest.email,
            name: guest.name,
            avatar: guest.avatar,
            permission: guest.permission,
            status: guest.status,
            addedAt: guest.createdAt,
        }));
        res.status(200).json({
            success: true,
            data: {
                guests: formattedGuests,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        // Handle invalid ID format
        if (message.includes("Invalid ID")) {
            res.status(400).json({
                success: false,
                error: "Event ID không hợp lệ",
            });
            return;
        }
        // Handle generic errors
        res.status(500).json({
            success: false,
            error: "Lỗi lấy danh sách khách",
            ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
        });
    }
};
exports.getEventGuests = getEventGuests;
