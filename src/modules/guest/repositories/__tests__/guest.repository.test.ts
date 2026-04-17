import { Types } from "mongoose";
import { guestRepository } from "../guest.repository";
import { Guest } from "../../models/guest.model";

jest.mock("../../models/guest.model");

/**
 * Unit tests for Guest Repository
 * Tests CRUD operations, duplicate detection, and error handling
 * Validates Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
describe("GuestRepository", () => {
  const mockEventId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();
  const mockGuestId = new Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("create", () => {
    it("should create a new guest document", async () => {
      const mockGuest = {
        _id: mockGuestId,
        eventId: mockEventId,
        userId: mockUserId,
        email: "john.doe@example.com",
        name: "John Doe",
        avatar: "https://example.com/avatar.jpg",
        permission: "view_guest_list",
        status: "pending",
      };

      (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

      const result = await guestRepository.create({
        eventId: mockEventId,
        userId: mockUserId,
        email: "john.doe@example.com",
        name: "John Doe",
        avatar: "https://example.com/avatar.jpg",
        permission: "view_guest_list",
        status: "pending",
      });

      expect(result).toEqual(mockGuest);
      expect(Guest.create).toHaveBeenCalled();
    });

    it("should use default permission if not provided", async () => {
      const mockGuest = {
        _id: mockGuestId,
        eventId: mockEventId,
        userId: mockUserId,
        email: "john.doe@example.com",
        name: "John Doe",
        permission: "view_guest_list",
        status: "pending",
      };

      (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

      await guestRepository.create({
        eventId: mockEventId,
        userId: mockUserId,
        email: "john.doe@example.com",
        name: "John Doe",
      });

      expect(Guest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          permission: "view_guest_list",
          status: "pending",
        }),
      );
    });

    it("should handle duplicate key error with descriptive message", async () => {
      const duplicateError = {
        code: 11000,
        keyPattern: { email: 1 },
        keyValue: { email: "john.doe@example.com" },
      };

      (Guest.create as jest.Mock).mockRejectedValueOnce(duplicateError);

      await expect(
        guestRepository.create({
          eventId: mockEventId,
          userId: mockUserId,
          email: "john.doe@example.com",
          name: "John Doe",
        }),
      ).rejects.toThrow("Duplicate guest");
    });

    it("should handle validation errors", async () => {
      const validationError = {
        name: "ValidationError",
        errors: {
          email: { message: "Invalid email format" },
        },
      };

      (Guest.create as jest.Mock).mockRejectedValueOnce(validationError);

      await expect(
        guestRepository.create({
          eventId: mockEventId,
          userId: mockUserId,
          email: "invalid",
          name: "John Doe",
        }),
      ).rejects.toThrow("Validation error");
    });
  });

  describe("findById", () => {
    it("should find a guest by ID", async () => {
      const mockGuest = {
        _id: mockGuestId,
        eventId: mockEventId,
        email: "john.doe@example.com",
        name: "John Doe",
      };

      const mockExec = jest.fn().mockResolvedValueOnce(mockGuest);
      (Guest.findById as jest.Mock).mockReturnValueOnce({ exec: mockExec });

      const result = await guestRepository.findById(mockGuestId);

      expect(result).toEqual(mockGuest);
      expect(Guest.findById).toHaveBeenCalledWith(mockGuestId);
    });

    it("should return null if guest not found", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findById as jest.Mock).mockReturnValueOnce({ exec: mockExec });

      const result = await guestRepository.findById(mockGuestId);

      expect(result).toBeNull();
    });

    it("should handle cast errors for invalid ID", async () => {
      const castError = {
        name: "CastError",
        value: "invalid-id",
      };

      const mockExec = jest.fn().mockRejectedValueOnce(castError);
      (Guest.findById as jest.Mock).mockReturnValueOnce({ exec: mockExec });

      await expect(guestRepository.findById("invalid-id")).rejects.toThrow(
        "Invalid ID format",
      );
    });
  });

  describe("findByEventAndEmail", () => {
    it("should find a guest by event and email", async () => {
      const mockGuest = {
        _id: mockGuestId,
        eventId: mockEventId,
        email: "john.doe@example.com",
        name: "John Doe",
      };

      const mockExec = jest.fn().mockResolvedValueOnce(mockGuest);
      (Guest.findOne as jest.Mock).mockReturnValueOnce({ exec: mockExec });

      const result = await guestRepository.findByEventAndEmail(
        mockEventId,
        "john.doe@example.com",
      );

      expect(result).toEqual(mockGuest);
      expect(Guest.findOne).toHaveBeenCalledWith({
        eventId: mockEventId,
        email: "john.doe@example.com",
      });
    });

    it("should normalize email to lowercase", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findOne as jest.Mock).mockReturnValueOnce({ exec: mockExec });

      await guestRepository.findByEventAndEmail(
        mockEventId,
        "JOHN.DOE@EXAMPLE.COM",
      );

      expect(Guest.findOne).toHaveBeenCalledWith({
        eventId: mockEventId,
        email: "john.doe@example.com",
      });
    });

    it("should return null if guest not found", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findOne as jest.Mock).mockReturnValueOnce({ exec: mockExec });

      const result = await guestRepository.findByEventAndEmail(
        mockEventId,
        "nonexistent@example.com",
      );

      expect(result).toBeNull();
    });

    it("should trim whitespace from email", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findOne as jest.Mock).mockReturnValueOnce({ exec: mockExec });

      await guestRepository.findByEventAndEmail(
        mockEventId,
        "  john.doe@example.com  ",
      );

      expect(Guest.findOne).toHaveBeenCalledWith({
        eventId: mockEventId,
        email: "john.doe@example.com",
      });
    });
  });

  describe("findByEventId", () => {
    it("should find all guests for an event", async () => {
      const mockGuests = [
        {
          _id: new Types.ObjectId(),
          eventId: mockEventId,
          email: "john.doe@example.com",
          name: "John Doe",
        },
        {
          _id: new Types.ObjectId(),
          eventId: mockEventId,
          email: "jane.doe@example.com",
          name: "Jane Doe",
        },
      ];

      const mockSort = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(mockGuests),
      });
      (Guest.find as jest.Mock).mockReturnValueOnce({
        sort: mockSort,
      });

      const result = await guestRepository.findByEventId(mockEventId);

      expect(result).toEqual(mockGuests);
      expect(Guest.find).toHaveBeenCalledWith({
        eventId: mockEventId,
      });
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it("should return empty array if no guests found", async () => {
      const mockSort = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce([]),
      });
      (Guest.find as jest.Mock).mockReturnValueOnce({
        sort: mockSort,
      });

      const result = await guestRepository.findByEventId(mockEventId);

      expect(result).toEqual([]);
    });

    it("should sort guests by creation date descending", async () => {
      const mockSort = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce([]),
      });
      (Guest.find as jest.Mock).mockReturnValueOnce({
        sort: mockSort,
      });

      await guestRepository.findByEventId(mockEventId);

      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe("findByUserId", () => {
    it("should find all guests for a user", async () => {
      const mockGuests = [
        {
          _id: new Types.ObjectId(),
          userId: mockUserId,
          email: "john.doe@example.com",
        },
      ];

      const mockSort = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(mockGuests),
      });
      (Guest.find as jest.Mock).mockReturnValueOnce({
        sort: mockSort,
      });

      const result = await guestRepository.findByUserId(mockUserId);

      expect(result).toEqual(mockGuests);
      expect(Guest.find).toHaveBeenCalledWith({
        userId: mockUserId,
      });
    });
  });

  describe("updateById", () => {
    it("should update guest permission", async () => {
      const mockGuest = {
        _id: mockGuestId,
        eventId: mockEventId,
        email: "john.doe@example.com",
        permission: "edit_event",
      };

      const mockExec = jest.fn().mockResolvedValueOnce(mockGuest);
      (Guest.findByIdAndUpdate as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.updateById(mockGuestId, {
        permission: "edit_event",
      });

      expect(result).toEqual(mockGuest);
      expect(Guest.findByIdAndUpdate).toHaveBeenCalledWith(
        mockGuestId,
        expect.objectContaining({
          $set: expect.objectContaining({
            permission: "edit_event",
          }),
        }),
        { new: true, runValidators: true },
      );
    });

    it("should update guest status", async () => {
      const mockGuest = {
        _id: mockGuestId,
        status: "accepted",
      };

      const mockExec = jest.fn().mockResolvedValueOnce(mockGuest);
      (Guest.findByIdAndUpdate as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.updateById(mockGuestId, {
        status: "accepted",
      });

      expect(result).toEqual(mockGuest);
    });

    it("should return null if guest not found", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findByIdAndUpdate as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.updateById(mockGuestId, {
        permission: "edit_event",
      });

      expect(result).toBeNull();
    });
  });

  describe("deleteById", () => {
    it("should delete a guest by ID", async () => {
      const mockGuest = {
        _id: mockGuestId,
        eventId: mockEventId,
        email: "john.doe@example.com",
      };

      const mockExec = jest.fn().mockResolvedValueOnce(mockGuest);
      (Guest.findByIdAndDelete as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.deleteById(mockGuestId);

      expect(result).toEqual(mockGuest);
      expect(Guest.findByIdAndDelete).toHaveBeenCalledWith(mockGuestId);
    });

    it("should return null if guest not found", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findByIdAndDelete as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.deleteById(mockGuestId);

      expect(result).toBeNull();
    });
  });

  describe("deleteByEventAndEmail", () => {
    it("should delete a guest by event and email", async () => {
      const mockGuest = {
        _id: mockGuestId,
        eventId: mockEventId,
        email: "john.doe@example.com",
      };

      const mockExec = jest.fn().mockResolvedValueOnce(mockGuest);
      (Guest.findOneAndDelete as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.deleteByEventAndEmail(
        mockEventId,
        "john.doe@example.com",
      );

      expect(result).toEqual(mockGuest);
      expect(Guest.findOneAndDelete).toHaveBeenCalledWith({
        eventId: mockEventId,
        email: "john.doe@example.com",
      });
    });

    it("should normalize email to lowercase", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findOneAndDelete as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      await guestRepository.deleteByEventAndEmail(
        mockEventId,
        "JOHN.DOE@EXAMPLE.COM",
      );

      expect(Guest.findOneAndDelete).toHaveBeenCalledWith({
        eventId: mockEventId,
        email: "john.doe@example.com",
      });
    });

    it("should return null if guest not found", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findOneAndDelete as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.deleteByEventAndEmail(
        mockEventId,
        "nonexistent@example.com",
      );

      expect(result).toBeNull();
    });
  });

  describe("deleteByEventId", () => {
    it("should delete all guests for an event", async () => {
      const mockResult = { deletedCount: 3 };

      const mockExec = jest.fn().mockResolvedValueOnce(mockResult);
      (Guest.deleteMany as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.deleteByEventId(mockEventId);

      expect(result).toEqual({ deletedCount: 3 });
      expect(Guest.deleteMany).toHaveBeenCalledWith({
        eventId: mockEventId,
      });
    });

    it("should return 0 if no guests found", async () => {
      const mockResult = { deletedCount: 0 };

      const mockExec = jest.fn().mockResolvedValueOnce(mockResult);
      (Guest.deleteMany as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.deleteByEventId(mockEventId);

      expect(result).toEqual({ deletedCount: 0 });
    });
  });

  describe("countByEventId", () => {
    it("should count guests for an event", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(5);
      (Guest.countDocuments as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.countByEventId(mockEventId);

      expect(result).toBe(5);
      expect(Guest.countDocuments).toHaveBeenCalledWith({
        eventId: mockEventId,
      });
    });

    it("should return 0 if no guests found", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(0);
      (Guest.countDocuments as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.countByEventId(mockEventId);

      expect(result).toBe(0);
    });
  });

  describe("existsByEventAndEmail", () => {
    it("should return true if guest exists", async () => {
      const mockGuest = {
        _id: mockGuestId,
        eventId: mockEventId,
        email: "john.doe@example.com",
      };

      const mockExec = jest.fn().mockResolvedValueOnce(mockGuest);
      (Guest.findOne as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.existsByEventAndEmail(
        mockEventId,
        "john.doe@example.com",
      );

      expect(result).toBe(true);
    });

    it("should return false if guest does not exist", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findOne as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      const result = await guestRepository.existsByEventAndEmail(
        mockEventId,
        "nonexistent@example.com",
      );

      expect(result).toBe(false);
    });

    it("should normalize email to lowercase", async () => {
      const mockExec = jest.fn().mockResolvedValueOnce(null);
      (Guest.findOne as jest.Mock).mockReturnValueOnce({
        exec: mockExec,
      });

      await guestRepository.existsByEventAndEmail(
        mockEventId,
        "JOHN.DOE@EXAMPLE.COM",
      );

      expect(Guest.findOne).toHaveBeenCalledWith({
        eventId: mockEventId,
        email: "john.doe@example.com",
      });
    });
  });

  describe("Error handling", () => {
    it("should handle MongoDB connection errors", async () => {
      const connectionError = {
        name: "MongoNetworkError",
        message: "Connection refused",
      };

      (Guest.create as jest.Mock).mockRejectedValueOnce(connectionError);

      await expect(
        guestRepository.create({
          eventId: mockEventId,
          userId: mockUserId,
          email: "test@example.com",
          name: "Test User",
        }),
      ).rejects.toThrow("Database connection error");
    });

    it("should handle MongoDB server errors", async () => {
      const serverError = {
        name: "MongoServerError",
        message: "Server error",
      };

      (Guest.create as jest.Mock).mockRejectedValueOnce(serverError);

      await expect(
        guestRepository.create({
          eventId: mockEventId,
          userId: mockUserId,
          email: "test@example.com",
          name: "Test User",
        }),
      ).rejects.toThrow("Database connection error");
    });

    it("should handle unknown errors gracefully", async () => {
      (Guest.create as jest.Mock).mockRejectedValueOnce("Unknown error string");

      await expect(
        guestRepository.create({
          eventId: mockEventId,
          userId: mockUserId,
          email: "test@example.com",
          name: "Test User",
        }),
      ).rejects.toThrow("An unexpected error occurred");
    });
  });

  describe("Duplicate prevention", () => {
    it("should prevent duplicate guests via compound index", async () => {
      const duplicateError = {
        code: 11000,
        keyPattern: { eventId: 1, email: 1 },
        keyValue: { eventId: mockEventId, email: "john.doe@example.com" },
      };

      (Guest.create as jest.Mock).mockRejectedValueOnce(duplicateError);

      await expect(
        guestRepository.create({
          eventId: mockEventId,
          userId: mockUserId,
          email: "john.doe@example.com",
          name: "John Doe",
        }),
      ).rejects.toThrow("Duplicate guest");
    });

    it("should provide descriptive error message for duplicates", async () => {
      const duplicateError = {
        code: 11000,
        keyPattern: { email: 1 },
        keyValue: { email: "john.doe@example.com" },
      };

      (Guest.create as jest.Mock).mockRejectedValueOnce(duplicateError);

      try {
        await guestRepository.create({
          eventId: mockEventId,
          userId: mockUserId,
          email: "john.doe@example.com",
          name: "John Doe",
        });
      } catch (error: any) {
        expect(error.message).toContain("john.doe@example.com");
        expect(error.message).toContain("already exists");
      }
    });
  });
});
