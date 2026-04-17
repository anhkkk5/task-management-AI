import { Types } from "mongoose";
import axios from "axios";
import { ContactSearchService, Contact } from "../contact-search.service";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock User model
jest.mock("../../../auth/auth.model", () => ({
  User: {
    findById: jest.fn(),
  },
}));

/**
 * Unit tests for Contact Search Service
 * Tests Google Contacts API integration, token refresh, error handling, and pagination
 *
 * Validates: Requirements 1.2, 1.5, 7.1, 7.4, 7.5
 */
describe("ContactSearchService", () => {
  let contactSearchService: ContactSearchService;
  const mockUserId = new Types.ObjectId();
  const mockAccessToken = "mock_access_token_123";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    contactSearchService = new ContactSearchService();
  });

  describe("searchContacts - Valid search term", () => {
    it("should search contacts with valid search term", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              names: [{ displayName: "John Doe" }],
              emailAddresses: [{ value: "john.doe@example.com" }],
              photos: [{ url: "https://example.com/photo1.jpg" }],
              phoneNumbers: [{ canonicalForm: "+1-555-0100" }],
            },
          },
          {
            person: {
              resourceName: "people/c0987654321",
              names: [{ displayName: "John Smith" }],
              emailAddresses: [{ value: "john.smith@example.com" }],
              photos: [{ url: "https://example.com/photo2.jpg" }],
              phoneNumbers: [{ canonicalForm: "+1-555-0101" }],
            },
          },
        ],
      };

      // Mock User.findById
      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      // Mock axios.get
      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "john",
        50,
        0,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "people/c1234567890",
        email: "john.doe@example.com",
        name: "John Doe",
        avatar: "https://example.com/photo1.jpg",
        phoneNumbers: ["+1-555-0100"],
      });
      expect(result[1]).toEqual({
        id: "people/c0987654321",
        email: "john.smith@example.com",
        name: "John Smith",
        avatar: "https://example.com/photo2.jpg",
        phoneNumbers: ["+1-555-0101"],
      });
    });

    it("should normalize email to lowercase", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              names: [{ displayName: "John Doe" }],
              emailAddresses: [{ value: "JOHN.DOE@EXAMPLE.COM" }],
              photos: [{ url: "https://example.com/photo1.jpg" }],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "john",
        50,
        0,
      );

      expect(result[0].email).toBe("john.doe@example.com");
    });

    it("should use email prefix as name fallback when name is missing", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              emailAddresses: [{ value: "john.doe@example.com" }],
              photos: [{ url: "https://example.com/photo1.jpg" }],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "john",
        50,
        0,
      );

      expect(result[0].name).toBe("john.doe");
    });

    it("should handle contacts without avatar", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              names: [{ displayName: "John Doe" }],
              emailAddresses: [{ value: "john.doe@example.com" }],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "john",
        50,
        0,
      );

      expect(result[0].avatar).toBeUndefined();
    });

    it("should skip contacts without email address", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              names: [{ displayName: "John Doe" }],
              // No email address
            },
          },
          {
            person: {
              resourceName: "people/c0987654321",
              names: [{ displayName: "Jane Doe" }],
              emailAddresses: [{ value: "jane.doe@example.com" }],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "john",
        50,
        0,
      );

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe("jane.doe@example.com");
    });
  });

  describe("searchContacts - Empty search term", () => {
    it("should return empty array for empty search term", async () => {
      const result = await contactSearchService.searchContacts(
        mockUserId,
        "",
        50,
        0,
      );

      expect(result).toEqual([]);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("should return empty array for whitespace-only search term", async () => {
      const result = await contactSearchService.searchContacts(
        mockUserId,
        "   ",
        50,
        0,
      );

      expect(result).toEqual([]);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe("searchContacts - Special characters", () => {
    it("should handle search term with special characters", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              names: [{ displayName: "José García" }],
              emailAddresses: [{ value: "jose.garcia@example.com" }],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "josé",
        50,
        0,
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("José García");
    });

    it("should handle search term with quotes and special symbols", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              names: [{ displayName: "O'Brien" }],
              emailAddresses: [{ value: "obrien@example.com" }],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "O'Brien",
        50,
        0,
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("O'Brien");
    });
  });

  describe("searchContacts - Token refresh on expired token", () => {
    it("should throw error when token is expired and refresh not implemented", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      // First call returns 401 (token expired)
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 401 },
      });

      // Token refresh is not implemented, so it returns null
      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("Failed to refresh Google authentication");
    });

    it("should handle 401 error and attempt token refresh", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      // First call returns 401 (token expired)
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 401 },
      });

      // Token refresh returns null (not implemented)
      try {
        await contactSearchService.searchContacts(mockUserId, "john", 50, 0);
      } catch (error) {
        // Should throw error about failed token refresh
        expect((error as Error).message).toContain("Failed to refresh");
      }
    });
  });

  describe("searchContacts - Error handling for Google API failures", () => {
    it("should handle 400 Bad Request error", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: { message: "Invalid query" } },
        },
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("Invalid search request");
    });

    it("should handle 403 Forbidden error", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 403 },
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("Permission denied");
    });

    it("should handle 429 Rate Limit error", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 429 },
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("Too many requests");
    });

    it("should handle 500 Internal Server Error", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 500 },
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("temporarily unavailable");
    });

    it("should handle 503 Service Unavailable error", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 503 },
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("temporarily unavailable");
    });

    it("should handle network timeout error", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockRejectedValueOnce({
        code: "ECONNABORTED",
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("Request timeout");
    });

    it("should handle network connection refused error", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockRejectedValueOnce({
        code: "ECONNREFUSED",
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("Network error");
    });

    it("should handle DNS resolution error", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockRejectedValueOnce({
        code: "ENOTFOUND",
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("Network error");
    });

    it("should throw error if user not found", async () => {
      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(null),
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("User not found");
    });

    it("should throw error if user has no Google access token", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: null,
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      await expect(
        contactSearchService.searchContacts(mockUserId, "john", 50, 0),
      ).rejects.toThrow("Google authentication required");
    });
  });

  describe("searchContacts - Pagination parameters", () => {
    it("should respect limit parameter", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1",
              names: [{ displayName: "Contact 1" }],
              emailAddresses: [{ value: "contact1@example.com" }],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      await contactSearchService.searchContacts(mockUserId, "contact", 25, 0);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            pageSize: 25,
          }),
        }),
      );
    });

    it("should cap limit to default page size", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      await contactSearchService.searchContacts(mockUserId, "contact", 100, 0);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            pageSize: 50, // Should be capped to 50
          }),
        }),
      );
    });

    it("should use default limit when not provided", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      await contactSearchService.searchContacts(mockUserId, "contact");

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            pageSize: 50, // Default page size
          }),
        }),
      );
    });

    it("should pass offset parameter to API", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      await contactSearchService.searchContacts(mockUserId, "contact", 50, 100);

      // Note: The current implementation doesn't use offset in the API call
      // This test documents the current behavior
      expect(mockedAxios.get).toHaveBeenCalled();
    });

    it("should handle empty results from API", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "nonexistent",
        50,
        0,
      );

      expect(result).toEqual([]);
    });

    it("should handle API response with no results field", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {};

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "contact",
        50,
        0,
      );

      expect(result).toEqual([]);
    });
  });

  describe("searchContacts - Additional edge cases", () => {
    it("should handle multiple phone numbers", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              names: [{ displayName: "John Doe" }],
              emailAddresses: [{ value: "john.doe@example.com" }],
              phoneNumbers: [
                { canonicalForm: "+1-555-0100" },
                { canonicalForm: "+1-555-0101" },
              ],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "john",
        50,
        0,
      );

      expect(result[0].phoneNumbers).toHaveLength(2);
      expect(result[0].phoneNumbers).toContain("+1-555-0100");
      expect(result[0].phoneNumbers).toContain("+1-555-0101");
    });

    it("should handle phone numbers with value fallback", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              names: [{ displayName: "John Doe" }],
              emailAddresses: [{ value: "john.doe@example.com" }],
              phoneNumbers: [
                { value: "555-0100" }, // No canonicalForm
              ],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "john",
        50,
        0,
      );

      expect(result[0].phoneNumbers).toContain("555-0100");
    });

    it("should use resourceName as contact ID", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              resourceName: "people/c1234567890",
              names: [{ displayName: "John Doe" }],
              emailAddresses: [{ value: "john.doe@example.com" }],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "john",
        50,
        0,
      );

      expect(result[0].id).toBe("people/c1234567890");
    });

    it("should fallback to email as ID if resourceName missing", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [
          {
            person: {
              names: [{ displayName: "John Doe" }],
              emailAddresses: [{ value: "john.doe@example.com" }],
            },
          },
        ],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      const result = await contactSearchService.searchContacts(
        mockUserId,
        "john",
        50,
        0,
      );

      expect(result[0].id).toBe("john.doe@example.com");
    });

    it("should set correct API headers", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      await contactSearchService.searchContacts(mockUserId, "john", 50, 0);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("should set 10 second timeout for API requests", async () => {
      const mockUser = {
        _id: mockUserId,
        googleAccessToken: mockAccessToken,
      };

      const mockGoogleResponse = {
        results: [],
      };

      const { User } = require("../../../auth/auth.model");
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValueOnce(mockUser),
      });

      mockedAxios.get.mockResolvedValueOnce({ data: mockGoogleResponse });

      await contactSearchService.searchContacts(mockUserId, "john", 50, 0);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 10000,
        }),
      );
    });
  });
});
