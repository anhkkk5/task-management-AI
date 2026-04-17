import { Types } from "mongoose";
import { guestService } from "../guest.service";
import { Guest } from "../../models/guest.model";

jest.mock("../../models/guest.model");

/**
 * Unit tests for Guest Service
 * Tests email validation, normalization, duplicate prevention, and CRUD operations
 */
describe("GuestService", () => {
  const mockEventId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("addGuest", () => {
    it("should add a guest with valid email", async () => {
      const mockGuest = {
        _id: new Types.ObjectId(),
        eventId: mockEventId,
        userId: mockUserId,
        email: "john.doe@example.com",
        name: "John Doe",
        avatar: "https://example.com/avatar.jpg",
        permission: "view_guest_list",
        status: "pending",
      };

      (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
      (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

      const result = await guestService.addGuest(
        mockEventId,
        mockUserId,
        "john.doe@example.com",
        "John Doe",
        "https://example.com/avatar.jpg",
        "view_guest_list",
      );

      expect(result).toEqual(mockGuest);
      expect(Guest.create).toHaveBeenCalled();
    });

    it("should normalize email to lowercase", async () => {
      const mockGuest = {
        _id: new Types.ObjectId(),
        eventId: mockEventId,
        userId: mockUserId,
        email: "john.doe@example.com",
        name: "John Doe",
        permission: "view_guest_list",
        status: "pending",
      };

      (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
      (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

      await guestService.addGuest(
        mockEventId,
        mockUserId,
        "JOHN.DOE@EXAMPLE.COM",
        "John Doe",
      );

      expect(Guest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "john.doe@example.com",
        }),
      );
    });

    it("should reject invalid email format", async () => {
      (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        guestService.addGuest(
          mockEventId,
          mockUserId,
          "invalid-email",
          "John Doe",
        ),
      ).rejects.toThrow("Invalid email format");
    });

    it("should prevent duplicate guest addition", async () => {
      const existingGuest = {
        _id: new Types.ObjectId(),
        eventId: mockEventId,
        email: "john.doe@example.com",
      };

      (Guest.findOne as jest.Mock).mockResolvedValueOnce(existingGuest);

      await expect(
        guestService.addGuest(
          mockEventId,
          mockUserId,
          "john.doe@example.com",
          "John Doe",
        ),
      ).rejects.toThrow("already added to this event");
    });

    it("should use default permission if not provided", async () => {
      const mockGuest = {
        _id: new Types.ObjectId(),
        eventId: mockEventId,
        userId: mockUserId,
        email: "john.doe@example.com",
        name: "John Doe",
        permission: "view_guest_list",
        status: "pending",
      };

      (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
      (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

      await guestService.addGuest(
        mockEventId,
        mockUserId,
        "john.doe@example.com",
        "John Doe",
      );

      expect(Guest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          permission: "view_guest_list",
        }),
      );
    });

    it("should trim whitespace from email and name", async () => {
      const mockGuest = {
        _id: new Types.ObjectId(),
        eventId: mockEventId,
        userId: mockUserId,
        email: "john.doe@example.com",
        name: "John Doe",
        permission: "view_guest_list",
        status: "pending",
      };

      (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
      (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

      await guestService.addGuest(
        mockEventId,
        mockUserId,
        "  john.doe@example.com  ",
        "  John Doe  ",
      );

      expect(Guest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "john.doe@example.com",
          name: "John Doe",
        }),
      );
    });
  });

  describe("removeGuest", () => {
    it("should remove a guest by ID", async () => {
      const guestId = new Types.ObjectId();
      const mockGuest = {
        _id: guestId,
        eventId: mockEventId,
        email: "john.doe@example.com",
      };

      (Guest.findByIdAndDelete as jest.Mock).mockResolvedValueOnce(mockGuest);

      const result = await guestService.removeGuest(guestId);

      expect(result).toEqual(mockGuest);
      expect(Guest.findByIdAndDelete).toHaveBeenCalledWith(guestId);
    });

    it("should throw error if guest not found", async () => {
      const guestId = new Types.ObjectId();

      (Guest.findByIdAndDelete as jest.Mock).mockResolvedValueOnce(null);

      await expect(guestService.removeGuest(guestId)).rejects.toThrow(
        "Guest not found",
      );
    });
  });

  describe("updateGuestPermission", () => {
    it("should update guest permission", async () => {
      const guestId = new Types.ObjectId();
      const mockGuest = {
        _id: guestId,
        eventId: mockEventId,
        email: "john.doe@example.com",
        permission: "edit_event",
      };

      (Guest.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(mockGuest);

      const result = await guestService.updateGuestPermission(
        guestId,
        "edit_event",
      );

      expect(result).toEqual(mockGuest);
      expect(Guest.findByIdAndUpdate).toHaveBeenCalledWith(
        guestId,
        { permission: "edit_event" },
        { new: true, runValidators: true },
      );
    });

    it("should throw error if guest not found", async () => {
      const guestId = new Types.ObjectId();

      (Guest.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        guestService.updateGuestPermission(guestId, "edit_event"),
      ).rejects.toThrow("Guest not found");
    });
  });

  describe("getEventGuests", () => {
    it("should retrieve all guests for an event", async () => {
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

      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValueOnce(mockGuests),
      });
      (Guest.find as jest.Mock).mockImplementation(mockFind);

      const result = await guestService.getEventGuests(mockEventId);

      expect(result).toEqual(mockGuests);
      expect(Guest.find).toHaveBeenCalledWith({ eventId: mockEventId });
    });

    it("should return empty array if no guests found", async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValueOnce([]),
      });
      (Guest.find as jest.Mock).mockImplementation(mockFind);

      const result = await guestService.getEventGuests(mockEventId);

      expect(result).toEqual([]);
    });
  });

  describe("getGuestById", () => {
    it("should retrieve a guest by ID", async () => {
      const guestId = new Types.ObjectId();
      const mockGuest = {
        _id: guestId,
        eventId: mockEventId,
        email: "john.doe@example.com",
        name: "John Doe",
      };

      (Guest.findById as jest.Mock).mockResolvedValueOnce(mockGuest);

      const result = await guestService.getGuestById(guestId);

      expect(result).toEqual(mockGuest);
      expect(Guest.findById).toHaveBeenCalledWith(guestId);
    });

    it("should return null if guest not found", async () => {
      const guestId = new Types.ObjectId();

      (Guest.findById as jest.Mock).mockResolvedValueOnce(null);

      const result = await guestService.getGuestById(guestId);

      expect(result).toBeNull();
    });
  });

  describe("Email validation", () => {
    const validEmails = [
      "user@example.com",
      "john.doe@example.co.uk",
      "test+tag@example.com",
      "user123@test-domain.com",
    ];

    const invalidEmails = [
      "invalid",
      "invalid@",
      "@example.com",
      "invalid@.com",
      "invalid email@example.com",
    ];

    validEmails.forEach((email) => {
      it(`should accept valid email: ${email}`, async () => {
        (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
        (Guest.create as jest.Mock).mockResolvedValueOnce({
          email: email.toLowerCase(),
        });

        await expect(
          guestService.addGuest(mockEventId, mockUserId, email, "Test User"),
        ).resolves.toBeDefined();
      });
    });

    invalidEmails.forEach((email) => {
      it(`should reject invalid email: ${email}`, async () => {
        (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);

        await expect(
          guestService.addGuest(mockEventId, mockUserId, email, "Test User"),
        ).rejects.toThrow("Invalid email format");
      });
    });
  });
});
