import { Types } from "mongoose";
import { Guest, GuestAttrs, GuestDoc } from "../models/guest.model";

/**
 * Guest Repository
 * Data access layer for Guest model
 * Handles all database operations for guest management
 *
 * Provides CRUD operations and specialized queries for:
 * - Duplicate detection (findByEventAndEmail)
 * - Event guest retrieval (findByEventId)
 * - Guest removal (deleteByEventAndEmail)
 * - Error handling with descriptive messages
 *
 * @module GuestRepository
 */
export const guestRepository = {
  /**
   * Create a new guest document
   * Stores guest information in the database
   *
   * @param attrs - Guest attributes (eventId, userId, email, name, avatar, permission, status)
   * @returns Promise<GuestDoc> - Created guest document
   * @throws Error if database operation fails or validation fails
   *
   * @example
   * const guest = await guestRepository.create({
   *   eventId: new Types.ObjectId(eventId),
   *   userId: new Types.ObjectId(userId),
   *   email: "john.doe@example.com",
   *   name: "John Doe",
   *   avatar: "https://example.com/avatar.jpg",
   *   permission: "view_guest_list",
   *   status: "pending"
   * });
   */
  create: async (attrs: GuestAttrs): Promise<GuestDoc> => {
    try {
      return await Guest.create({
        eventId: attrs.eventId,
        userId: attrs.userId,
        email: attrs.email,
        name: attrs.name,
        avatar: attrs.avatar,
        permission: attrs.permission ?? "view_guest_list",
        googleContactId: attrs.googleContactId,
        status: attrs.status ?? "pending",
      });
    } catch (error) {
      throw guestRepository.handleError(error, "create");
    }
  },

  /**
   * Find a guest by ID
   * Retrieves a single guest document by its MongoDB ID
   *
   * @param guestId - The guest ID to find
   * @returns Promise<GuestDoc | null> - Guest document or null if not found
   * @throws Error if database operation fails
   *
   * @example
   * const guest = await guestRepository.findById(guestId);
   */
  findById: async (
    guestId: string | Types.ObjectId,
  ): Promise<GuestDoc | null> => {
    try {
      return await Guest.findById(guestId).exec();
    } catch (error) {
      throw guestRepository.handleError(error, "findById");
    }
  },

  /**
   * Find a guest by event and email
   * Used for duplicate detection - ensures same email is not added twice to same event
   * Email is normalized to lowercase for comparison
   *
   * @param eventId - The event ID
   * @param email - The guest email address (will be normalized to lowercase)
   * @returns Promise<GuestDoc | null> - Guest document or null if not found
   * @throws Error if database operation fails
   *
   * @example
   * const existingGuest = await guestRepository.findByEventAndEmail(
   *   eventId,
   *   "john.doe@example.com"
   * );
   * if (existingGuest) {
   *   throw new Error("Guest already added to this event");
   * }
   */
  findByEventAndEmail: async (
    eventId: string | Types.ObjectId,
    email: string,
  ): Promise<GuestDoc | null> => {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      return await Guest.findOne({
        eventId: new Types.ObjectId(eventId),
        email: normalizedEmail,
      }).exec();
    } catch (error) {
      throw guestRepository.handleError(error, "findByEventAndEmail");
    }
  },

  /**
   * Find all guests for a specific event
   * Retrieves all guest documents associated with an event
   * Results are sorted by creation date (newest first)
   *
   * @param eventId - The event ID
   * @returns Promise<GuestDoc[]> - Array of guest documents
   * @throws Error if database operation fails
   *
   * @example
   * const guests = await guestRepository.findByEventId(eventId);
   * console.log(`Event has ${guests.length} guests`);
   */
  findByEventId: async (
    eventId: string | Types.ObjectId,
  ): Promise<GuestDoc[]> => {
    try {
      return await Guest.find({
        eventId: new Types.ObjectId(eventId),
      })
        .sort({ createdAt: -1 })
        .exec();
    } catch (error) {
      throw guestRepository.handleError(error, "findByEventId");
    }
  },

  /**
   * Find all guests for a specific user
   * Retrieves all guest documents created by a user
   * Useful for user-level guest management
   *
   * @param userId - The user ID
   * @returns Promise<GuestDoc[]> - Array of guest documents
   * @throws Error if database operation fails
   *
   * @example
   * const userGuests = await guestRepository.findByUserId(userId);
   */
  findByUserId: async (
    userId: string | Types.ObjectId,
  ): Promise<GuestDoc[]> => {
    try {
      return await Guest.find({
        userId: new Types.ObjectId(userId),
      })
        .sort({ createdAt: -1 })
        .exec();
    } catch (error) {
      throw guestRepository.handleError(error, "findByUserId");
    }
  },

  /**
   * Update a guest by ID
   * Updates specific fields of an existing guest document
   * Returns the updated document
   *
   * @param guestId - The guest ID to update
   * @param update - Object containing fields to update (permission, status, etc.)
   * @returns Promise<GuestDoc | null> - Updated guest document or null if not found
   * @throws Error if database operation fails or validation fails
   *
   * @example
   * const updatedGuest = await guestRepository.updateById(guestId, {
   *   permission: "edit_event",
   *   status: "accepted"
   * });
   */
  updateById: async (
    guestId: string | Types.ObjectId,
    update: {
      permission?: "edit_event" | "view_guest_list" | "invite_others";
      status?: "pending" | "accepted" | "declined";
      name?: string;
      avatar?: string;
    },
  ): Promise<GuestDoc | null> => {
    try {
      return await Guest.findByIdAndUpdate(
        guestId,
        {
          $set: {
            ...(update.permission !== undefined
              ? { permission: update.permission }
              : {}),
            ...(update.status !== undefined ? { status: update.status } : {}),
            ...(update.name !== undefined ? { name: update.name } : {}),
            ...(update.avatar !== undefined ? { avatar: update.avatar } : {}),
          },
        },
        { new: true, runValidators: true },
      ).exec();
    } catch (error) {
      throw guestRepository.handleError(error, "updateById");
    }
  },

  /**
   * Delete a guest by ID
   * Removes a guest document from the database
   *
   * @param guestId - The guest ID to delete
   * @returns Promise<GuestDoc | null> - Deleted guest document or null if not found
   * @throws Error if database operation fails
   *
   * @example
   * const deletedGuest = await guestRepository.deleteById(guestId);
   */
  deleteById: async (
    guestId: string | Types.ObjectId,
  ): Promise<GuestDoc | null> => {
    try {
      return await Guest.findByIdAndDelete(guestId).exec();
    } catch (error) {
      throw guestRepository.handleError(error, "deleteById");
    }
  },

  /**
   * Delete a guest by event and email
   * Removes a guest from an event using event ID and email address
   * Email is normalized to lowercase for matching
   * Used when removing a guest by email instead of ID
   *
   * @param eventId - The event ID
   * @param email - The guest email address (will be normalized to lowercase)
   * @returns Promise<GuestDoc | null> - Deleted guest document or null if not found
   * @throws Error if database operation fails
   *
   * @example
   * const deletedGuest = await guestRepository.deleteByEventAndEmail(
   *   eventId,
   *   "john.doe@example.com"
   * );
   */
  deleteByEventAndEmail: async (
    eventId: string | Types.ObjectId,
    email: string,
  ): Promise<GuestDoc | null> => {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      return await Guest.findOneAndDelete({
        eventId: new Types.ObjectId(eventId),
        email: normalizedEmail,
      }).exec();
    } catch (error) {
      throw guestRepository.handleError(error, "deleteByEventAndEmail");
    }
  },

  /**
   * Delete all guests for an event
   * Removes all guest documents associated with an event
   * Useful for event deletion or cleanup operations
   *
   * @param eventId - The event ID
   * @returns Promise<{ deletedCount: number }> - Number of deleted documents
   * @throws Error if database operation fails
   *
   * @example
   * const result = await guestRepository.deleteByEventId(eventId);
   * console.log(`Deleted ${result.deletedCount} guests`);
   */
  deleteByEventId: async (
    eventId: string | Types.ObjectId,
  ): Promise<{ deletedCount: number }> => {
    try {
      const result = await Guest.deleteMany({
        eventId: new Types.ObjectId(eventId),
      }).exec();
      return { deletedCount: result.deletedCount || 0 };
    } catch (error) {
      throw guestRepository.handleError(error, "deleteByEventId");
    }
  },

  /**
   * Count guests for an event
   * Returns the number of guests associated with an event
   *
   * @param eventId - The event ID
   * @returns Promise<number> - Number of guests
   * @throws Error if database operation fails
   *
   * @example
   * const count = await guestRepository.countByEventId(eventId);
   * console.log(`Event has ${count} guests`);
   */
  countByEventId: async (eventId: string | Types.ObjectId): Promise<number> => {
    try {
      return await Guest.countDocuments({
        eventId: new Types.ObjectId(eventId),
      }).exec();
    } catch (error) {
      throw guestRepository.handleError(error, "countByEventId");
    }
  },

  /**
   * Check if a guest exists for an event and email
   * Returns true if guest exists, false otherwise
   * Used for duplicate prevention checks
   *
   * @param eventId - The event ID
   * @param email - The guest email address (will be normalized to lowercase)
   * @returns Promise<boolean> - True if guest exists, false otherwise
   * @throws Error if database operation fails
   *
   * @example
   * const exists = await guestRepository.existsByEventAndEmail(eventId, email);
   * if (exists) {
   *   throw new Error("Guest already added");
   * }
   */
  existsByEventAndEmail: async (
    eventId: string | Types.ObjectId,
    email: string,
  ): Promise<boolean> => {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const guest = await Guest.findOne({
        eventId: new Types.ObjectId(eventId),
        email: normalizedEmail,
      }).exec();
      return !!guest;
    } catch (error) {
      throw guestRepository.handleError(error, "existsByEventAndEmail");
    }
  },

  /**
   * Handle and format database errors
   * Converts MongoDB errors into descriptive error messages
   * Handles:
   * - Duplicate key errors (MongoDB error code 11000)
   * - Validation errors
   * - Connection errors
   * - Custom errors
   *
   * @private
   * @param error - The error object from database operation
   * @param operation - The operation name for context (e.g., "create", "findById")
   * @returns Error - Formatted error with descriptive message
   */
  handleError: (error: any, operation: string): Error => {
    // Handle duplicate key error (MongoDB error code 11000)
    // This occurs when trying to insert a duplicate value in a unique index
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const value = Object.values(error.keyValue || {})[0];
      return new Error(
        `Duplicate guest: A guest with ${field} "${value}" already exists for this event`,
      );
    }

    // Handle validation errors from Mongoose schema
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors || {})
        .map((err: any) => err.message)
        .join(", ");
      return new Error(`Validation error in guest repository: ${messages}`);
    }

    // Handle cast errors (invalid ObjectId format)
    if (error.name === "CastError") {
      return new Error(
        `Invalid ID format in guest repository: ${error.value} is not a valid guest ID`,
      );
    }

    // Handle MongoDB connection errors
    if (
      error.name === "MongoNetworkError" ||
      error.name === "MongoServerError"
    ) {
      return new Error(
        `Database connection error in guest repository: ${error.message}`,
      );
    }

    // Handle custom errors
    if (error instanceof Error) {
      return new Error(
        `Guest repository error in ${operation}: ${error.message}`,
      );
    }

    // Handle unknown errors
    return new Error(
      `An unexpected error occurred in guest repository during ${operation}`,
    );
  },
};
