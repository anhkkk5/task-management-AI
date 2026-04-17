import {
  validateEmailFormat,
  normalizeEmail,
  validatePermission,
  getValidPermissions,
  validateSearchTerm,
  validatePaginationParams,
  validateAddGuestRequest,
  validateUpdatePermissionRequest,
  validateSearchContactsQuery,
} from "../guest-validation.middleware";

describe("Guest Validation Middleware", () => {
  describe("validateEmailFormat", () => {
    it("should accept valid email addresses", () => {
      expect(validateEmailFormat("john.doe@example.com")).toBe(true);
      expect(validateEmailFormat("user+tag@domain.co.uk")).toBe(true);
      expect(validateEmailFormat("test_email@test-domain.com")).toBe(true);
      expect(validateEmailFormat("a@b.co")).toBe(true);
    });

    it("should reject invalid email addresses", () => {
      expect(validateEmailFormat("invalid.email")).toBe(false);
      expect(validateEmailFormat("@example.com")).toBe(false);
      expect(validateEmailFormat("user@")).toBe(false);
      expect(validateEmailFormat("user@domain")).toBe(false);
      expect(validateEmailFormat("user..name@domain.com")).toBe(false);
      expect(validateEmailFormat("user@domain..com")).toBe(false);
    });

    it("should reject empty or null values", () => {
      expect(validateEmailFormat("")).toBe(false);
      expect(validateEmailFormat("   ")).toBe(false);
      expect(validateEmailFormat(null as any)).toBe(false);
      expect(validateEmailFormat(undefined as any)).toBe(false);
    });

    it("should reject non-string values", () => {
      expect(validateEmailFormat(123 as any)).toBe(false);
      expect(validateEmailFormat({} as any)).toBe(false);
      expect(validateEmailFormat([] as any)).toBe(false);
    });
  });

  describe("normalizeEmail", () => {
    it("should convert email to lowercase", () => {
      expect(normalizeEmail("John.Doe@Example.COM")).toBe(
        "john.doe@example.com",
      );
      expect(normalizeEmail("USER@DOMAIN.COM")).toBe("user@domain.com");
    });

    it("should trim whitespace", () => {
      expect(normalizeEmail("  user@domain.com  ")).toBe("user@domain.com");
      expect(normalizeEmail("\tuser@domain.com\n")).toBe("user@domain.com");
    });

    it("should handle combined case and whitespace", () => {
      expect(normalizeEmail("  John.Doe@Example.COM  ")).toBe(
        "john.doe@example.com",
      );
    });
  });

  describe("validatePermission", () => {
    it("should accept valid permissions", () => {
      expect(validatePermission("edit_event")).toBe(true);
      expect(validatePermission("view_guest_list")).toBe(true);
      expect(validatePermission("invite_others")).toBe(true);
    });

    it("should reject invalid permissions", () => {
      expect(validatePermission("invalid_permission")).toBe(false);
      expect(validatePermission("EDIT_EVENT")).toBe(false);
      expect(validatePermission("edit event")).toBe(false);
    });

    it("should reject empty or null values", () => {
      expect(validatePermission("")).toBe(false);
      expect(validatePermission(null)).toBe(false);
      expect(validatePermission(undefined)).toBe(false);
    });

    it("should reject non-string values", () => {
      expect(validatePermission(123)).toBe(false);
      expect(validatePermission({})).toBe(false);
      expect(validatePermission([])).toBe(false);
    });
  });

  describe("getValidPermissions", () => {
    it("should return array of valid permissions", () => {
      const permissions = getValidPermissions();
      expect(permissions).toContain("edit_event");
      expect(permissions).toContain("view_guest_list");
      expect(permissions).toContain("invite_others");
      expect(permissions.length).toBe(3);
    });
  });

  describe("validateSearchTerm", () => {
    it("should accept valid search terms", () => {
      expect(validateSearchTerm("john")).toEqual({ valid: true });
      expect(validateSearchTerm("john doe")).toEqual({ valid: true });
      expect(validateSearchTerm("a")).toEqual({ valid: true });
      expect(validateSearchTerm("test@example.com")).toEqual({ valid: true });
    });

    it("should reject empty search terms", () => {
      const result = validateSearchTerm("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should reject search terms with only whitespace", () => {
      const result = validateSearchTerm("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should reject search terms exceeding 100 characters", () => {
      const longTerm = "a".repeat(101);
      const result = validateSearchTerm(longTerm);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("100 characters");
    });

    it("should accept search terms exactly 100 characters", () => {
      const term = "a".repeat(100);
      expect(validateSearchTerm(term)).toEqual({ valid: true });
    });

    it("should reject non-string values", () => {
      const result = validateSearchTerm(123);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-empty string");
    });

    it("should reject null or undefined", () => {
      expect(validateSearchTerm(null).valid).toBe(false);
      expect(validateSearchTerm(undefined).valid).toBe(false);
    });
  });

  describe("validatePaginationParams", () => {
    it("should accept valid pagination parameters", () => {
      const result = validatePaginationParams(50, 0);
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it("should use default values when not provided", () => {
      const result = validatePaginationParams(undefined, undefined);
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it("should cap limit at 50", () => {
      const result = validatePaginationParams(100, 0);
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(50);
    });

    it("should accept limit less than 50", () => {
      const result = validatePaginationParams(25, 0);
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(25);
    });

    it("should reject negative limit", () => {
      const result = validatePaginationParams(-1, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("positive integer");
    });

    it("should reject zero limit", () => {
      const result = validatePaginationParams(0, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("positive integer");
    });

    it("should accept non-negative offset", () => {
      const result = validatePaginationParams(50, 100);
      expect(result.valid).toBe(true);
      expect(result.offset).toBe(100);
    });

    it("should reject negative offset", () => {
      const result = validatePaginationParams(50, -1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-negative integer");
    });

    it("should floor decimal values", () => {
      const result = validatePaginationParams(50.7, 10.3);
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });

    it("should reject non-numeric values", () => {
      const result = validatePaginationParams("abc", 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("positive integer");
    });
  });

  describe("validateAddGuestRequest", () => {
    it("should accept valid add guest request", () => {
      const body = {
        eventId: "123",
        email: "john@example.com",
        name: "John Doe",
        permission: "view_guest_list",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept request without optional avatar and permission", () => {
      const body = {
        eventId: "123",
        email: "john@example.com",
        name: "John Doe",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept request with valid avatar URL", () => {
      const body = {
        eventId: "123",
        email: "john@example.com",
        name: "John Doe",
        avatar: "https://example.com/avatar.jpg",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject request with missing eventId", () => {
      const body = {
        email: "john@example.com",
        name: "John Doe",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "eventId")).toBe(true);
    });

    it("should reject request with empty eventId", () => {
      const body = {
        eventId: "   ",
        email: "john@example.com",
        name: "John Doe",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "eventId")).toBe(true);
    });

    it("should reject request with missing email", () => {
      const body = {
        eventId: "123",
        name: "John Doe",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "email")).toBe(true);
    });

    it("should reject request with invalid email format", () => {
      const body = {
        eventId: "123",
        email: "invalid.email",
        name: "John Doe",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "email")).toBe(true);
    });

    it("should reject request with missing name", () => {
      const body = {
        eventId: "123",
        email: "john@example.com",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "name")).toBe(true);
    });

    it("should reject request with empty name", () => {
      const body = {
        eventId: "123",
        email: "john@example.com",
        name: "   ",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "name")).toBe(true);
    });

    it("should reject request with invalid avatar URL", () => {
      const body = {
        eventId: "123",
        email: "john@example.com",
        name: "John Doe",
        avatar: "not-a-url",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "avatar")).toBe(true);
    });

    it("should reject request with invalid permission", () => {
      const body = {
        eventId: "123",
        email: "john@example.com",
        name: "John Doe",
        permission: "invalid_permission",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "permission")).toBe(true);
    });

    it("should report multiple validation errors", () => {
      const body = {
        eventId: "",
        email: "invalid.email",
        name: "",
      };
      const result = validateAddGuestRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe("validateUpdatePermissionRequest", () => {
    it("should accept valid update permission request", () => {
      const body = { permission: "edit_event" };
      const result = validateUpdatePermissionRequest(body);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept all valid permission values", () => {
      const permissions = ["edit_event", "view_guest_list", "invite_others"];
      permissions.forEach((permission) => {
        const result = validateUpdatePermissionRequest({ permission });
        expect(result.valid).toBe(true);
      });
    });

    it("should reject request with missing permission", () => {
      const body = {};
      const result = validateUpdatePermissionRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "permission")).toBe(true);
    });

    it("should reject request with null permission", () => {
      const body = { permission: null };
      const result = validateUpdatePermissionRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "permission")).toBe(true);
    });

    it("should reject request with invalid permission", () => {
      const body = { permission: "invalid_permission" };
      const result = validateUpdatePermissionRequest(body);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "permission")).toBe(true);
    });
  });

  describe("validateSearchContactsQuery", () => {
    it("should accept valid search query", () => {
      const query = { q: "john", limit: 50, offset: 0 };
      const result = validateSearchContactsQuery(query);
      expect(result.valid).toBe(true);
      expect(result.searchTerm).toBe("john");
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it("should use default pagination values", () => {
      const query = { q: "john" };
      const result = validateSearchContactsQuery(query);
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it("should reject query with missing search term", () => {
      const query = { limit: 50, offset: 0 };
      const result = validateSearchContactsQuery(query);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject query with empty search term", () => {
      const query = { q: "   " };
      const result = validateSearchContactsQuery(query);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject query with invalid limit", () => {
      const query = { q: "john", limit: -1 };
      const result = validateSearchContactsQuery(query);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject query with invalid offset", () => {
      const query = { q: "john", offset: -1 };
      const result = validateSearchContactsQuery(query);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should trim search term", () => {
      const query = { q: "  john  " };
      const result = validateSearchContactsQuery(query);
      expect(result.valid).toBe(true);
      expect(result.searchTerm).toBe("john");
    });

    it("should cap limit at 50", () => {
      const query = { q: "john", limit: 100 };
      const result = validateSearchContactsQuery(query);
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(50);
    });
  });
});
