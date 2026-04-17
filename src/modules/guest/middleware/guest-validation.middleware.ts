import { NextFunction, Request, Response } from "express";

/**
 * Guest Validation Middleware
 *
 * This middleware provides reusable validation functions for guest-related operations.
 * It validates:
 * - Email format and normalization
 * - Permission values
 * - Search term length and format
 * - Pagination parameters (limit, offset)
 *
 * All validation functions return descriptive error messages for client feedback.
 *
 * @module guest-validation.middleware
 */

/**
 * Valid permission types for guests
 * @type {readonly string[]}
 */
const VALID_PERMISSIONS = [
  "edit_event",
  "view_guest_list",
  "invite_others",
] as const;

/**
 * Permission type definition
 */
type Permission = (typeof VALID_PERMISSIONS)[number];

/**
 * Validation error response interface
 */
interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Validate email format
 *
 * Checks if email matches standard email pattern:
 * - Must contain @ symbol
 * - Must have local part (before @) with alphanumeric, dots, underscores, hyphens, plus signs
 * - Must have domain part (after @) with alphanumeric, dots, hyphens
 * - Must have valid TLD (2+ characters)
 * - Rejects consecutive dots, spaces, invalid characters
 *
 * @param email - Email address to validate
 * @returns boolean - True if email is valid, false otherwise
 *
 * @example
 * validateEmailFormat("john.doe@example.com") // true
 * validateEmailFormat("invalid.email") // false
 * validateEmailFormat("user+tag@domain.co.uk") // true
 */
export const validateEmailFormat = (email: string): boolean => {
  if (!email || typeof email !== "string") {
    return false;
  }

  const trimmedEmail = email.trim();

  // Basic checks
  if (!trimmedEmail.includes("@")) {
    return false;
  }

  const [localPart, ...domainParts] = trimmedEmail.split("@");
  const domain = domainParts.join("@");

  // Check for empty parts
  if (!localPart || !domain) {
    return false;
  }

  // Check for consecutive dots
  if (localPart.includes("..") || domain.includes("..")) {
    return false;
  }

  // Check for leading/trailing dots
  if (localPart.startsWith(".") || localPart.endsWith(".")) {
    return false;
  }

  if (domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }

  // Email regex pattern: standard email format validation
  const emailRegex = /^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  return emailRegex.test(trimmedEmail);
};

/**
 * Normalize email address
 *
 * Converts email to lowercase and trims whitespace.
 * This ensures consistent email comparison and storage.
 *
 * @param email - Email address to normalize
 * @returns string - Normalized email address
 *
 * @example
 * normalizeEmail("John.Doe@Example.COM") // "john.doe@example.com"
 * normalizeEmail("  user@domain.com  ") // "user@domain.com"
 */
export const normalizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};

/**
 * Validate permission value
 *
 * Checks if permission is one of the allowed values:
 * - "edit_event": Guest can edit event details
 * - "view_guest_list": Guest can view other guests
 * - "invite_others": Guest can invite additional guests
 *
 * @param permission - Permission value to validate
 * @returns boolean - True if permission is valid, false otherwise
 *
 * @example
 * validatePermission("edit_event") // true
 * validatePermission("invalid_permission") // false
 * validatePermission(null) // false
 */
export const validatePermission = (
  permission: unknown,
): permission is Permission => {
  if (!permission || typeof permission !== "string") {
    return false;
  }

  return VALID_PERMISSIONS.includes(permission as Permission);
};

/**
 * Get list of valid permissions
 *
 * Returns array of allowed permission values for reference.
 *
 * @returns string[] - Array of valid permission values
 *
 * @example
 * getValidPermissions() // ["edit_event", "view_guest_list", "invite_others"]
 */
export const getValidPermissions = (): readonly string[] => {
  return VALID_PERMISSIONS;
};

/**
 * Validate search term
 *
 * Checks if search term meets requirements:
 * - Must be a non-empty string
 * - Must be at least 1 character (after trimming)
 * - Must be at most 100 characters
 * - Can contain alphanumeric, spaces, and common special characters
 *
 * @param searchTerm - Search term to validate
 * @returns { valid: boolean; error?: string } - Validation result with optional error message
 *
 * @example
 * validateSearchTerm("john") // { valid: true }
 * validateSearchTerm("") // { valid: false, error: "Search term cannot be empty" }
 * validateSearchTerm("a".repeat(101)) // { valid: false, error: "Search term must be at most 100 characters" }
 */
export const validateSearchTerm = (
  searchTerm: unknown,
): { valid: boolean; error?: string } => {
  if (!searchTerm || typeof searchTerm !== "string") {
    return {
      valid: false,
      error: "Search term must be a non-empty string",
    };
  }

  const trimmed = searchTerm.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: "Search term cannot be empty",
    };
  }

  if (trimmed.length > 100) {
    return {
      valid: false,
      error: "Search term must be at most 100 characters",
    };
  }

  return { valid: true };
};

/**
 * Validate pagination parameters
 *
 * Checks if limit and offset are valid positive integers:
 * - limit: Must be positive integer, default 50, max 50
 * - offset: Must be non-negative integer, default 0
 *
 * @param limit - Limit parameter (number of results)
 * @param offset - Offset parameter (pagination position)
 * @returns { valid: boolean; limit: number; offset: number; error?: string } - Validation result with normalized values
 *
 * @example
 * validatePaginationParams(50, 0) // { valid: true, limit: 50, offset: 0 }
 * validatePaginationParams(-1, 0) // { valid: false, error: "Limit must be a positive integer" }
 * validatePaginationParams(100, 0) // { valid: true, limit: 50, offset: 0 } (capped at 50)
 */
export const validatePaginationParams = (
  limit: unknown,
  offset: unknown,
): { valid: boolean; limit: number; offset: number; error?: string } => {
  // Parse limit
  let parsedLimit = 50; // default
  if (limit !== undefined && limit !== null) {
    const n = Number(limit);
    if (!Number.isFinite(n) || n <= 0) {
      return {
        valid: false,
        limit: 50,
        offset: 0,
        error: "Limit must be a positive integer",
      };
    }
    parsedLimit = Math.floor(n);
  }

  // Cap limit at 50
  parsedLimit = Math.min(parsedLimit, 50);

  // Parse offset
  let parsedOffset = 0; // default
  if (offset !== undefined && offset !== null) {
    const n = Number(offset);
    if (!Number.isFinite(n) || n < 0) {
      return {
        valid: false,
        limit: parsedLimit,
        offset: 0,
        error: "Offset must be a non-negative integer",
      };
    }
    parsedOffset = Math.floor(n);
  }

  return {
    valid: true,
    limit: parsedLimit,
    offset: parsedOffset,
  };
};

/**
 * Validate add guest request body
 *
 * Validates all required fields for adding a guest:
 * - eventId: Must be non-empty string
 * - email: Must be valid email format
 * - name: Must be non-empty string
 * - avatar: Optional, must be valid URL if provided
 * - permission: Must be valid permission value
 *
 * @param body - Request body to validate
 * @returns { valid: boolean; errors: ValidationError[] } - Validation result with list of errors
 *
 * @example
 * validateAddGuestRequest({
 *   eventId: "123",
 *   email: "john@example.com",
 *   name: "John Doe",
 *   permission: "view_guest_list"
 * }) // { valid: true, errors: [] }
 */
export const validateAddGuestRequest = (
  body: any,
): { valid: boolean; errors: ValidationError[] } => {
  const errors: ValidationError[] = [];

  // Validate eventId
  if (
    !body?.eventId ||
    typeof body.eventId !== "string" ||
    !body.eventId.trim()
  ) {
    errors.push({
      field: "eventId",
      message: "Event ID is required and must be a non-empty string",
      value: body?.eventId,
    });
  }

  // Validate email
  if (!body?.email || typeof body.email !== "string") {
    errors.push({
      field: "email",
      message: "Email is required and must be a string",
      value: body?.email,
    });
  } else if (!validateEmailFormat(body.email)) {
    errors.push({
      field: "email",
      message: "Email format is invalid",
      value: body.email,
    });
  }

  // Validate name
  if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
    errors.push({
      field: "name",
      message: "Guest name is required and must be a non-empty string",
      value: body?.name,
    });
  }

  // Validate avatar (optional)
  if (body?.avatar !== undefined && body.avatar !== null) {
    if (typeof body.avatar !== "string") {
      errors.push({
        field: "avatar",
        message: "Avatar must be a string",
        value: body.avatar,
      });
    } else if (body.avatar.trim() && !isValidUrl(body.avatar.trim())) {
      errors.push({
        field: "avatar",
        message: "Avatar must be a valid URL",
        value: body.avatar,
      });
    }
  }

  // Validate permission (optional, defaults to "view_guest_list")
  if (body?.permission !== undefined && body.permission !== null) {
    if (!validatePermission(body.permission)) {
      errors.push({
        field: "permission",
        message: `Permission must be one of: ${VALID_PERMISSIONS.join(", ")}`,
        value: body.permission,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate update permission request body
 *
 * Validates permission field for updating guest permission:
 * - permission: Must be valid permission value
 *
 * @param body - Request body to validate
 * @returns { valid: boolean; errors: ValidationError[] } - Validation result with list of errors
 *
 * @example
 * validateUpdatePermissionRequest({ permission: "edit_event" })
 * // { valid: true, errors: [] }
 */
export const validateUpdatePermissionRequest = (
  body: any,
): { valid: boolean; errors: ValidationError[] } => {
  const errors: ValidationError[] = [];

  // Validate permission
  if (body?.permission === undefined || body.permission === null) {
    errors.push({
      field: "permission",
      message: "Permission is required",
      value: body?.permission,
    });
  } else if (!validatePermission(body.permission)) {
    errors.push({
      field: "permission",
      message: `Permission must be one of: ${VALID_PERMISSIONS.join(", ")}`,
      value: body.permission,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate search contacts request query parameters
 *
 * Validates query parameters for searching contacts:
 * - q: Search term (required, 1-100 characters)
 * - limit: Results limit (optional, default 50, max 50)
 * - offset: Pagination offset (optional, default 0)
 *
 * @param query - Request query parameters to validate
 * @returns { valid: boolean; searchTerm?: string; limit?: number; offset?: number; error?: string } - Validation result
 *
 * @example
 * validateSearchContactsQuery({ q: "john", limit: 50, offset: 0 })
 * // { valid: true, searchTerm: "john", limit: 50, offset: 0 }
 */
export const validateSearchContactsQuery = (
  query: any,
): {
  valid: boolean;
  searchTerm?: string;
  limit?: number;
  offset?: number;
  error?: string;
} => {
  // Validate search term
  const searchTermValidation = validateSearchTerm(query?.q);
  if (!searchTermValidation.valid) {
    return {
      valid: false,
      error: searchTermValidation.error,
    };
  }

  // Validate pagination parameters
  const paginationValidation = validatePaginationParams(
    query?.limit,
    query?.offset,
  );
  if (!paginationValidation.valid) {
    return {
      valid: false,
      error: paginationValidation.error,
    };
  }

  return {
    valid: true,
    searchTerm: (query.q as string).trim(),
    limit: paginationValidation.limit,
    offset: paginationValidation.offset,
  };
};

/**
 * Check if string is a valid URL
 *
 * Simple URL validation for avatar URLs.
 * Checks if string starts with http:// or https://
 *
 * @private
 * @param url - URL string to validate
 * @returns boolean - True if URL is valid, false otherwise
 */
const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Express middleware for validating add guest request
 *
 * Validates request body and returns 400 Bad Request if validation fails.
 * Attaches validated data to req.validatedData for use in controller.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 *
 * @example
 * router.post("/add", validateAddGuestMiddleware, addGuestController);
 */
export const validateAddGuestMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const validation = validateAddGuestRequest(req.body);

  if (!validation.valid) {
    res.status(400).json({
      success: false,
      error: "Validation failed",
      details: validation.errors.map((err) => ({
        field: err.field,
        message: err.message,
      })),
    });
    return;
  }

  next();
};

/**
 * Express middleware for validating update permission request
 *
 * Validates request body and returns 400 Bad Request if validation fails.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 *
 * @example
 * router.put("/:guestId/permission", validateUpdatePermissionMiddleware, updatePermissionController);
 */
export const validateUpdatePermissionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const validation = validateUpdatePermissionRequest(req.body);

  if (!validation.valid) {
    res.status(400).json({
      success: false,
      error: "Validation failed",
      details: validation.errors.map((err) => ({
        field: err.field,
        message: err.message,
      })),
    });
    return;
  }

  next();
};

/**
 * Express middleware for validating search contacts query
 *
 * Validates query parameters and returns 400 Bad Request if validation fails.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 *
 * @example
 * router.get("/search", validateSearchContactsMiddleware, searchContactsController);
 */
export const validateSearchContactsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const validation = validateSearchContactsQuery(req.query);

  if (!validation.valid) {
    res.status(400).json({
      success: false,
      error: validation.error,
    });
    return;
  }

  next();
};
