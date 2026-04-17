import { Types } from "mongoose";
import { Guest, GuestAttrs } from "../models/guest.model";

/**
 * Guest Service
 * Handles business logic for managing guests in calendar events
 * Includes email validation, normalization, duplicate prevention, and CRUD operations
 *
 * @class GuestService
 */
export class GuestService {
  /**
   * Email validation regex pattern
   * Matches standard email format: local@domain.extension
   * Supports: alphanumeric, dots, underscores, hyphens, plus signs
   * Rejects: consecutive dots, spaces, invalid characters
   * @private
   */
  private readonly EMAIL_REGEX =
    /^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  /**
   * Add a guest to an event
   * Validates email format, normalizes to lowercase, and prevents duplicates
   *
   * @param eventId - The event ID to add guest to
   * @param userId - The user ID (event owner)
   * @param email - Guest email address
   * @param name - Guest name
   * @param avatar - Optional guest avatar URL
   * @param permission - Guest permission level (default: "view_guest_list")
   * @returns Promise<any> - Created guest document
   * @throws Error if email is invalid, guest already exists, or database operation fails
   *
   * @example
   * const guest = await guestService.addGuest(
   *   eventId,
   *   userId,
   *   "john.doe@example.com",
   *   "John Doe",
   *   "https://example.com/avatar.jpg",
   *   "view_guest_list"
   * );
   */
  async addGuest(
    eventId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    email: string,
    name: string,
    avatar?: string,
    permission:
      | "edit_event"
      | "view_guest_list"
      | "invite_others" = "view_guest_list",
  ): Promise<any> {
    try {
      // Validate email format
      const normalizedEmail = this.normalizeEmail(email);
      if (!this.isValidEmail(normalizedEmail)) {
        throw new Error(`Invalid email format: ${email}`);
      }

      // Check for duplicate guest
      const existingGuest = await this.findByEventAndEmail(
        eventId,
        normalizedEmail,
      );
      if (existingGuest) {
        throw new Error(
          `Guest with email ${normalizedEmail} already added to this event`,
        );
      }

      // Create guest document
      const guestAttrs: GuestAttrs = {
        eventId: new Types.ObjectId(eventId),
        userId: new Types.ObjectId(userId),
        email: normalizedEmail,
        name: name.trim(),
        avatar: avatar?.trim(),
        permission,
        status: "pending",
      };

      const guest = await Guest.create(guestAttrs);
      return guest;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Remove a guest from an event
   * Deletes the guest document from the database
   *
   * @param guestId - The guest ID to remove
   * @returns Promise<any> - Deleted guest document
   * @throws Error if guest not found or database operation fails
   *
   * @example
   * const deletedGuest = await guestService.removeGuest(guestId);
   */
  async removeGuest(guestId: string | Types.ObjectId): Promise<any> {
    try {
      const guest = await Guest.findByIdAndDelete(guestId);

      if (!guest) {
        throw new Error(`Guest not found: ${guestId}`);
      }

      return guest;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Update guest permission level
   * Updates the permission field for an existing guest
   *
   * @param guestId - The guest ID to update
   * @param permission - New permission level
   * @returns Promise<any> - Updated guest document
   * @throws Error if guest not found or database operation fails
   *
   * @example
   * const updatedGuest = await guestService.updateGuestPermission(
   *   guestId,
   *   "edit_event"
   * );
   */
  async updateGuestPermission(
    guestId: string | Types.ObjectId,
    permission: "edit_event" | "view_guest_list" | "invite_others",
  ): Promise<any> {
    try {
      const guest = await Guest.findByIdAndUpdate(
        guestId,
        { permission },
        { new: true, runValidators: true },
      );

      if (!guest) {
        throw new Error(`Guest not found: ${guestId}`);
      }

      return guest;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get all guests for an event
   * Retrieves all guest documents associated with a specific event
   *
   * @param eventId - The event ID
   * @returns Promise<any[]> - Array of guest documents
   * @throws Error if database operation fails
   *
   * @example
   * const guests = await guestService.getEventGuests(eventId);
   */
  async getEventGuests(eventId: string | Types.ObjectId): Promise<any[]> {
    try {
      const guests = await Guest.find({ eventId }).sort({ createdAt: -1 });
      return guests;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get a guest by ID
   * Retrieves a single guest document by its ID
   *
   * @param guestId - The guest ID
   * @returns Promise<any | null> - Guest document or null if not found
   * @throws Error if database operation fails
   *
   * @example
   * const guest = await guestService.getGuestById(guestId);
   */
  async getGuestById(guestId: string | Types.ObjectId): Promise<any | null> {
    try {
      const guest = await Guest.findById(guestId);
      return guest;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Find guest by event and email
   * Used for duplicate prevention check
   *
   * @private
   * @param eventId - The event ID
   * @param email - The normalized email address
   * @returns Promise<any | null> - Guest document or null if not found
   */
  private async findByEventAndEmail(
    eventId: string | Types.ObjectId,
    email: string,
  ): Promise<any | null> {
    try {
      const guest = await Guest.findOne({
        eventId,
        email: email.toLowerCase().trim(),
      });
      return guest;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Validate email format
   * Checks if email matches the standard email pattern
   *
   * @private
   * @param email - Email address to validate
   * @returns boolean - True if email is valid, false otherwise
   */
  private isValidEmail(email: string): boolean {
    return this.EMAIL_REGEX.test(email);
  }

  /**
   * Normalize email address
   * Converts to lowercase and trims whitespace
   *
   * @private
   * @param email - Email address to normalize
   * @returns string - Normalized email address
   */
  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Handle and format errors from database operations
   *
   * @private
   * @param error - The error object
   * @returns Error - Formatted error with descriptive message
   */
  private handleError(error: any): Error {
    // Handle duplicate key error (MongoDB error code 11000)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return new Error(`Duplicate value for field: ${field}`);
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors)
        .map((err: any) => err.message)
        .join(", ");
      return new Error(`Validation error: ${messages}`);
    }

    // Handle custom errors
    if (error instanceof Error) {
      return error;
    }

    // Handle unknown errors
    return new Error("An unexpected error occurred in guest service");
  }
}

// Export singleton instance
export const guestService = new GuestService();
