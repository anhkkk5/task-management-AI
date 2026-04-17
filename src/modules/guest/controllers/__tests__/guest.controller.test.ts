import { Request, Response } from "express";
import { Types } from "mongoose";
import * as guestController from "../guest.controller";
import { guestService } from "../../services/guest.service";
import { contactSearchService } from "../../services/contact-search.service";
import { guestRepository } from "../../repositories/guest.repository";

jest.mock("../../services/guest.service");
jest.mock("../../services/contact-search.service");
jest.mock("../../repositories/guest.repository");

describe("Guest Controller", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJsonResponse: jest.Mock;
  let mockStatusResponse: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockJsonResponse = jest.fn().mockReturnValue(undefined);
    mockStatusResponse = jest.fn().mockReturnValue({
      json: mockJsonResponse,
    });

    mockResponse = {
      status: mockStatusResponse,
      json: mockJsonResponse,
    };

    mockRequest = {
      user: {
        userId: new Types.ObjectId().toString(),
        email: "test@example.com",
        role: "user",
      },
      query: {},
      params: {},
      body: {},
    };
  });

  describe("searchContacts", () => {
    it("should return contacts with correct response format", async () => {
      const mockContacts = [
        {
          id: "contact_1",
          email: "john.doe@example.com",
          name: "John Doe",
          avatar: "https://example.com/avatar1.jpg",
          phoneNumbers: ["123-456-7890"],
        },
      ];

      mockRequest.query = { q: "john", limit: "50", offset: "0" };
      (contactSearchService.searchContacts as jest.Mock).mockResolvedValueOnce(mockContacts);

      await guestController.searchContacts(mockRequest as Request, mockResponse as Response);

      expect(mockStatusResponse).toHaveBeenCalledWith(200);
      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          contacts: mockContacts,
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
    });

    it("should return 400 when search term is empty", async () => {
      mockRequest.query = { q: "" };
      await guestController.searchContacts(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(400);
      expect(mockJsonResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it("should return 401 when user is not authenticated", async () => {
      mockRequest.user = undefined;
      mockRequest.query = { q: "john" };
      await guestController.searchContacts(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(401);
    });

    it("should return 401 when Google authentication is required", async () => {
      mockRequest.query = { q: "john" };
      (contactSearchService.searchContacts as jest.Mock).mockRejectedValueOnce(
        new Error("Google authentication required")
      );
      await guestController.searchContacts(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(401);
    });

    it("should return 429 when rate limit is exceeded", async () => {
      mockRequest.query = { q: "john" };
      (contactSearchService.searchContacts as jest.Mock).mockRejectedValueOnce(
        new Error("Too many requests to Google API")
      );
      await guestController.searchContacts(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(429);
    });

    it("should return 503 when Google service is unavailable", async () => {
      mockRequest.query = { q: "john" };
      (contactSearchService.searchContacts as jest.Mock).mockRejectedValueOnce(
        new Error("Google Contacts service is temporarily unavailable")
      );
      await guestController.searchContacts(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(503);
    });

    it("should handle pagination parameters correctly", async () => {
      mockRequest.query = { q: "john", limit: "100", offset: "50" };
      (contactSearchService.searchContacts as jest.Mock).mockResolvedValueOnce([]);
      await guestController.searchContacts(mockRequest as Request, mockResponse as Response);
      expect(contactSearchService.searchContacts).toHaveBeenCalledWith(expect.any(String), "john", 50, 50);
    });
  });

  describe("addGuest", () => {
    it("should add guest with valid data", async () => {
      const mockGuest = {
        _id: new Types.ObjectId(),
        eventId: new Types.ObjectId(),
        email: "john.doe@example.com",
        name: "John Doe",
        avatar: "https://example.com/avatar.jpg",
        permission: "view_guest_list",
        createdAt: new Date(),
      };

      mockRequest.body = {
        eventId: mockGuest.eventId.toString(),
        email: "john.doe@example.com",
        name: "John Doe",
        avatar: "https://example.com/avatar.jpg",
        permission: "view_guest_list",
      };

      (guestService.addGuest as jest.Mock).mockResolvedValueOnce(mockGuest);
      await guestController.addGuest(mockRequest as Request, mockResponse as Response);

      expect(mockStatusResponse).toHaveBeenCalledWith(201);
      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          guestId: mockGuest._id,
          eventId: mockGuest.eventId,
          email: mockGuest.email,
          name: mockGuest.name,
          avatar: mockGuest.avatar,
          permission: mockGuest.permission,
          createdAt: mockGuest.createdAt,
        },
      });
    });

    it("should return 400 when email is invalid", async () => {
      mockRequest.body = {
        eventId: new Types.ObjectId().toString(),
        email: "invalid-email",
        name: "John Doe",
      };

      (guestService.addGuest as jest.Mock).mockRejectedValueOnce(new Error("Invalid email format"));
      await guestController.addGuest(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(400);
    });

    it("should return 409 when guest is duplicate", async () => {
      mockRequest.body = {
        eventId: new Types.ObjectId().toString(),
        email: "john.doe@example.com",
        name: "John Doe",
      };

      (guestService.addGuest as jest.Mock).mockRejectedValueOnce(new Error("already added"));
      await guestController.addGuest(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(409);
    });

    it("should return 400 when required fields are missing", async () => {
      mockRequest.body = { eventId: new Types.ObjectId().toString() };
      await guestController.addGuest(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(400);
    });

    it("should return 401 when user is not authenticated", async () => {
      mockRequest.user = undefined;
      mockRequest.body = {
        eventId: new Types.ObjectId().toString(),
        email: "john.doe@example.com",
        name: "John Doe",
      };
      await guestController.addGuest(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(401);
    });

    it("should use default permission when not provided", async () => {
      const mockGuest = {
        _id: new Types.ObjectId(),
        eventId: new Types.ObjectId(),
        email: "john.doe@example.com",
        name: "John Doe",
        permission: "view_guest_list",
        createdAt: new Date(),
      };

      mockRequest.body = {
        eventId: mockGuest.eventId.toString(),
        email: "john.doe@example.com",
        name: "John Doe",
      };

      (guestService.addGuest as jest.Mock).mockResolvedValueOnce(mockGuest);
      await guestController.addGuest(mockRequest as Request, mockResponse as Response);

      expect(guestService.addGuest).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "john.doe@example.com",
        "John Doe",
        undefined,
        "view_guest_list",
      );
    });
  });

  describe("removeGuest", () => {
    it("should remove guest successfully", async () => {
      const guestId = new Types.ObjectId().toString();
      mockRequest.params = { guestId };

      const mockGuest = {
        _id: guestId,
        eventId: new Types.ObjectId(),
        email: "john.doe@example.com",
      };

      (guestRepository.findById as jest.Mock).mockResolvedValueOnce(mockGuest);
      (guestService.removeGuest as jest.Mock).mockResolvedValueOnce(mockGuest);

      await guestController.removeGuest(mockRequest as Request, mockResponse as Response);

      expect(mockStatusResponse).toHaveBeenCalledWith(200);
      expect(mockJsonResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("should return 404 when guest not found", async () => {
      const guestId = new Types.ObjectId().toString();
      mockRequest.params = { guestId };
      (guestRepository.findById as jest.Mock).mockResolvedValueOnce(null);
      await guestController.removeGuest(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(404);
    });

    it("should return 400 when guestId is invalid", async () => {
      mockRequest.params = { guestId: "" };
      await guestController.removeGuest(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(400);
    });

    it("should return 401 when user is not authenticated", async () => {
      mockRequest.user = undefined;
      mockRequest.params = { guestId: new Types.ObjectId().toString() };
      await guestController.removeGuest(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(401);
    });
  });

  describe("updateGuestPermission", () => {
    it("should update guest permission successfully", async () => {
      const guestId = new Types.ObjectId().toString();
      mockRequest.params = { guestId };
      mockRequest.body = { permission: "edit_event" };

      const mockGuest = {
        _id: guestId,
        eventId: new Types.ObjectId(),
        email: "john.doe@example.com",
        permission: "edit_event",
        updatedAt: new Date(),
      };

      (guestService.updateGuestPermission as jest.Mock).mockResolvedValueOnce(mockGuest);
      await guestController.updateGuestPermission(mockRequest as Request, mockResponse as Response);

      expect(mockStatusResponse).toHaveBeenCalledWith(200);
      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          guestId: mockGuest._id,
          permission: mockGuest.permission,
          updatedAt: mockGuest.updatedAt,
        },
      });
    });

    it("should return 400 when permission is invalid", async () => {
      const guestId = new Types.ObjectId().toString();
      mockRequest.params = { guestId };
      mockRequest.body = { permission: "invalid_permission" };
      await guestController.updateGuestPermission(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(400);
    });

    it("should return 404 when guest not found", async () => {
      const guestId = new Types.ObjectId().toString();
      mockRequest.params = { guestId };
      mockRequest.body = { permission: "edit_event" };
      (guestService.updateGuestPermission as jest.Mock).mockRejectedValueOnce(new Error("not found"));
      await guestController.updateGuestPermission(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(404);
    });

    it("should return 400 when guestId is invalid", async () => {
      mockRequest.params = { guestId: "" };
      mockRequest.body = { permission: "edit_event" };
      await guestController.updateGuestPermission(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(400);
    });

    it("should return 401 when user is not authenticated", async () => {
      mockRequest.user = undefined;
      mockRequest.params = { guestId: new Types.ObjectId().toString() };
      mockRequest.body = { permission: "edit_event" };
      await guestController.updateGuestPermission(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(401);
    });
  });

  describe("getEventGuests", () => {
    it("should return all guests for an event", async () => {
      const eventId = new Types.ObjectId().toString();
      mockRequest.params = { eventId };

      const mockGuests = [
        {
          _id: new Types.ObjectId(),
          eventId,
          email: "john.doe@example.com",
          name: "John Doe",
          avatar: "https://example.com/avatar1.jpg",
          permission: "view_guest_list",
          status: "pending",
          createdAt: new Date(),
        },
        {
          _id: new Types.ObjectId(),
          eventId,
          email: "jane.smith@example.com",
          name: "Jane Smith",
          avatar: "https://example.com/avatar2.jpg",
          permission: "edit_event",
          status: "accepted",
          createdAt: new Date(),
        },
      ];

      (guestService.getEventGuests as jest.Mock).mockResolvedValueOnce(mockGuests);
      await guestController.getEventGuests(mockRequest as Request, mockResponse as Response);

      expect(mockStatusResponse).toHaveBeenCalledWith(200);
      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          guests: [
            {
              guestId: mockGuests[0]._id,
              email: mockGuests[0].email,
              name: mockGuests[0].name,
              avatar: mockGuests[0].avatar,
              permission: mockGuests[0].permission,
              status: mockGuests[0].status,
              addedAt: mockGuests[0].createdAt,
            },
            {
              guestId: mockGuests[1]._id,
              email: mockGuests[1].email,
              name: mockGuests[1].name,
              avatar: mockGuests[1].avatar,
              permission: mockGuests[1].permission,
              status: mockGuests[1].status,
              addedAt: mockGuests[1].createdAt,
            },
          ],
        },
      });
    });

    it("should return empty guest list when no guests exist", async () => {
      const eventId = new Types.ObjectId().toString();
      mockRequest.params = { eventId };
      (guestService.getEventGuests as jest.Mock).mockResolvedValueOnce([]);
      await guestController.getEventGuests(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(200);
      expect(mockJsonResponse).toHaveBeenCalledWith({ success: true, data: { guests: [] } });
    });

    it("should return 400 when eventId is invalid", async () => {
      mockRequest.params = { eventId: "" };
      await guestController.getEventGuests(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(400);
    });

    it("should return 401 when user is not authenticated", async () => {
      mockRequest.user = undefined;
      mockRequest.params = { eventId: new Types.ObjectId().toString() };
      await guestController.getEventGuests(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(401);
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors in searchContacts", async () => {
      mockRequest.query = { q: "john" };
      (contactSearchService.searchContacts as jest.Mock).mockRejectedValueOnce(
        new Error("Network error")
      );
      await guestController.searchContacts(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(503);
    });

    it("should handle validation errors in addGuest", async () => {
      mockRequest.body = {
        eventId: new Types.ObjectId().toString(),
        email: "john.doe@example.com",
        name: "John Doe",
      };
      (guestService.addGuest as jest.Mock).mockRejectedValueOnce(new Error("Validation error"));
      await guestController.addGuest(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(400);
    });

    it("should handle generic errors with descriptive messages", async () => {
      mockRequest.query = { q: "john" };
      (contactSearchService.searchContacts as jest.Mock).mockRejectedValueOnce(
        new Error("Unexpected error")
      );
      await guestController.searchContacts(mockRequest as Request, mockResponse as Response);
      expect(mockStatusResponse).toHaveBeenCalledWith(500);
    });
  });
});
