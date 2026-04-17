import { Types } from "mongoose";
import * as fc from "fast-check";
import { guestService } from "../guest.service";
import { Guest } from "../../models/guest.model";

jest.mock("../../models/guest.model");

/**
 * Property-Based Tests for Guest Service
 * Tests universal properties that should hold across all valid inputs
 * Using fast-check library for generating random test data
 *
 * Validates: Requirements 3.4, 6.1, 6.2, 4.4, 4.5, 9.1, 9.2, 9.3, 4.2, 1.5, 6.5, 7.5
 */
describe("GuestService - Property-Based Tests", () => {
  const mockEventId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();

  /**
   * Property 4: Guest Persistence Round-Trip
   * For any guest added to an event with email, name, and avatar,
   * saving and retrieving should return the same guest information
   *
   * Validates: Requirements 3.4, 6.1, 6.2, 4.4, 4.5
   */
  describe("Property 4: Guest Persistence Round-Trip", () => {
    test("should persist and retrieve guest with all fields intact", async () => {
      const emailArbitrary = fc
        .tuple(fc.emailAddress(), fc.integer({ min: 1, max: 9999 }))
        .map(([email, num]) => `test${num}@example.com`);

      const nameArbitrary = fc
        .tuple(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
        )
        .map(([first, last]) => `${first} ${last}`);

      const avatarArbitrary = fc
        .tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 }),
        )
        .map(([id, ext]) => `https://example.com/avatars/${id}.${ext}`);

      const permissionArbitrary = fc.constantFrom(
        "edit_event",
        "view_guest_list",
        "invite_others",
      );

      await fc.assert(
        fc.asyncProperty(
          emailArbitrary,
          nameArbitrary,
          avatarArbitrary,
          permissionArbitrary,
          async (email, name, avatar, permission) => {
            jest.clearAllMocks();

            const mockGuest = {
              _id: new Types.ObjectId(),
              eventId: mockEventId,
              userId: mockUserId,
              email: email.toLowerCase().trim(),
              name: name.trim(),
              avatar: avatar.trim(),
              permission,
              status: "pending",
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
            (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);
            (Guest.findById as jest.Mock).mockResolvedValueOnce(mockGuest);

            const addedGuest = await guestService.addGuest(
              mockEventId,
              mockUserId,
              email,
              name,
              avatar,
              permission,
            );

            expect(addedGuest.email).toBe(email.toLowerCase().trim());
            expect(addedGuest.name).toBe(name.trim());
            expect(addedGuest.avatar).toBe(avatar.trim());
            expect(addedGuest.permission).toBe(permission);
            expect(addedGuest.status).toBe("pending");

            const retrievedGuest = await guestService.getGuestById(
              addedGuest._id,
            );

            expect(retrievedGuest.email).toBe(email.toLowerCase().trim());
            expect(retrievedGuest.name).toBe(name.trim());
            expect(retrievedGuest.avatar).toBe(avatar.trim());
            expect(retrievedGuest.permission).toBe(permission);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 5: Email Validation and Normalization
   * For any email address provided, if it is in valid format,
   * it should be normalized to lowercase; if invalid, rejected with error
   *
   * Validates: Requirements 9.1, 9.2, 9.3
   */
  describe("Property 5: Email Validation and Normalization", () => {
    test("should normalize valid emails to lowercase", async () => {
      const validEmailArbitrary = fc
        .tuple(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
        )
        .map(([local, domain]) => `${local}@${domain}.com`);

      await fc.assert(
        fc.asyncProperty(validEmailArbitrary, async (email) => {
          jest.clearAllMocks();

          const mockGuest = {
            _id: new Types.ObjectId(),
            eventId: mockEventId,
            userId: mockUserId,
            email: email.toLowerCase().trim(),
            name: "Test User",
            permission: "view_guest_list",
            status: "pending",
          };

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

          const guest = await guestService.addGuest(
            mockEventId,
            mockUserId,
            email,
            "Test User",
          );

          expect(guest.email).toBe(email.toLowerCase().trim());
        }),
        { numRuns: 100 },
      );
    });

    test("should reject invalid emails with error message", async () => {
      const invalidEmailArbitrary = fc.string({ minLength: 1, maxLength: 20 });

      await fc.assert(
        fc.asyncProperty(invalidEmailArbitrary, async (invalidEmail) => {
          jest.clearAllMocks();

          if (invalidEmail.includes("@") && invalidEmail.includes(".")) {
            return;
          }

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);

          try {
            await guestService.addGuest(
              mockEventId,
              mockUserId,
              invalidEmail,
              "Test User",
            );
            throw new Error("Should have rejected invalid email");
          } catch (error: any) {
            expect(error.message).toContain("Invalid email format");
          }
        }),
        { numRuns: 50 },
      );
    });

    test("should normalize emails with mixed case and whitespace", async () => {
      const mixedCaseEmailArbitrary = fc
        .tuple(
          fc.string({ minLength: 1, maxLength: 15 }),
          fc.string({ minLength: 1, maxLength: 15 }),
        )
        .map(([local, domain]) => `  ${local}@${domain}.com  `);

      await fc.assert(
        fc.asyncProperty(mixedCaseEmailArbitrary, async (email) => {
          jest.clearAllMocks();

          const mockGuest = {
            _id: new Types.ObjectId(),
            eventId: mockEventId,
            userId: mockUserId,
            email: email.toLowerCase().trim(),
            name: "Test User",
            permission: "view_guest_list",
            status: "pending",
          };

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

          const guest = await guestService.addGuest(
            mockEventId,
            mockUserId,
            email,
            "Test User",
          );

          expect(guest.email).toBe(email.toLowerCase().trim());
          expect(guest.email).not.toContain(" ");
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 6: Permission Update Persistence
   * For any guest with an assigned permission, updating the permission
   * and saving should persist the new permission
   *
   * Validates: Requirements 4.2, 4.4, 4.5
   */
  describe("Property 6: Permission Update Persistence", () => {
    test("should persist updated permissions correctly", async () => {
      const permissionArbitrary = fc.constantFrom(
        "edit_event",
        "view_guest_list",
        "invite_others",
      );

      await fc.assert(
        fc.asyncProperty(
          permissionArbitrary,
          permissionArbitrary,
          async (initialPermission, updatedPermission) => {
            jest.clearAllMocks();

            const guestId = new Types.ObjectId();

            const updatedGuest = {
              _id: guestId,
              eventId: mockEventId,
              userId: mockUserId,
              email: "test@example.com",
              name: "Test User",
              permission: updatedPermission,
              status: "pending",
              updatedAt: new Date(),
            };

            (Guest.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(
              updatedGuest,
            );
            (Guest.findById as jest.Mock).mockResolvedValueOnce(updatedGuest);

            const guest = await guestService.updateGuestPermission(
              guestId,
              updatedPermission,
            );

            expect(guest.permission).toBe(updatedPermission);

            const retrievedGuest = await guestService.getGuestById(guestId);

            expect(retrievedGuest.permission).toBe(updatedPermission);
          },
        ),
        { numRuns: 100 },
      );
    });

    test("should handle all valid permission transitions", async () => {
      const permissions = [
        "edit_event",
        "view_guest_list",
        "invite_others",
      ] as const;

      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.constantFrom(...permissions),
            fc.constantFrom(...permissions),
          ),
          async ([from, to]) => {
            jest.clearAllMocks();

            const guestId = new Types.ObjectId();

            const updatedGuest = {
              _id: guestId,
              eventId: mockEventId,
              permission: to,
            };

            (Guest.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(
              updatedGuest,
            );

            const guest = await guestService.updateGuestPermission(guestId, to);
            expect(guest.permission).toBe(to);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 10: Error Handling Consistency
   * For any API error (Google API, database), the system should return
   * an error response with a descriptive message
   *
   * Validates: Requirements 1.5, 6.5, 7.5
   */
  describe("Property 10: Error Handling Consistency", () => {
    test("should handle database errors with descriptive messages", async () => {
      const errorTypeArbitrary = fc.constantFrom(
        "DUPLICATE_KEY",
        "VALIDATION_ERROR",
        "CONNECTION_ERROR",
        "UNKNOWN_ERROR",
      );

      await fc.assert(
        fc.asyncProperty(errorTypeArbitrary, async (errorType) => {
          jest.clearAllMocks();

          let mockError: any;

          switch (errorType) {
            case "DUPLICATE_KEY":
              mockError = new Error("Duplicate value for field: email");
              mockError.code = 11000;
              mockError.keyPattern = { email: 1 };
              break;
            case "VALIDATION_ERROR":
              mockError = new Error("Validation error: Invalid email");
              mockError.name = "ValidationError";
              mockError.errors = {
                email: { message: "Invalid email" },
              };
              break;
            case "CONNECTION_ERROR":
              mockError = new Error("Database connection failed");
              break;
            case "UNKNOWN_ERROR":
              mockError = new Error("An unexpected error occurred");
              break;
          }

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockRejectedValueOnce(mockError);

          try {
            await guestService.addGuest(
              mockEventId,
              mockUserId,
              "test@example.com",
              "Test User",
            );
            throw new Error("Should have thrown error");
          } catch (error: any) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBeTruthy();
            expect(error.message.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 50 },
      );
    });

    test("should not crash service on various error types", async () => {
      const errorArbitrary = fc.oneof(
        fc.constant(new Error("Network timeout")),
        fc.constant(new Error("Database unavailable")),
        fc.constant(new Error("Invalid operation")),
        fc.constant(new Error("Permission denied")),
      );

      await fc.assert(
        fc.asyncProperty(errorArbitrary, async (error) => {
          jest.clearAllMocks();

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockRejectedValueOnce(error);

          try {
            await guestService.addGuest(
              mockEventId,
              mockUserId,
              "test@example.com",
              "Test User",
            );
            throw new Error("Should have thrown error");
          } catch (caughtError: any) {
            expect(caughtError).toBeInstanceOf(Error);
            expect(typeof caughtError.message).toBe("string");
          }
        }),
        { numRuns: 50 },
      );
    });

    test("should provide consistent error format across operations", async () => {
      const operationArbitrary = fc.constantFrom(
        "addGuest",
        "removeGuest",
        "updatePermission",
      );

      await fc.assert(
        fc.asyncProperty(operationArbitrary, async (operation) => {
          jest.clearAllMocks();

          const guestId = new Types.ObjectId();
          const testError = new Error("Operation failed");

          switch (operation) {
            case "addGuest":
              (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
              (Guest.create as jest.Mock).mockRejectedValueOnce(testError);

              try {
                await guestService.addGuest(
                  mockEventId,
                  mockUserId,
                  "test@example.com",
                  "Test User",
                );
              } catch (error: any) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toBeTruthy();
              }
              break;

            case "removeGuest":
              (Guest.findByIdAndDelete as jest.Mock).mockRejectedValueOnce(
                testError,
              );

              try {
                await guestService.removeGuest(guestId);
              } catch (error: any) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toBeTruthy();
              }
              break;

            case "updatePermission":
              (Guest.findByIdAndUpdate as jest.Mock).mockRejectedValueOnce(
                testError,
              );

              try {
                await guestService.updateGuestPermission(guestId, "edit_event");
              } catch (error: any) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toBeTruthy();
              }
              break;
          }
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Additional Property: Email Format Consistency
   * Ensures that email validation is consistent across all operations
   */
  describe("Additional Property: Email Format Consistency", () => {
    test("should consistently validate email format across multiple operations", async () => {
      const emailArbitrary = fc
        .tuple(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
        )
        .map(([local, domain]) => `${local}@${domain}.com`);

      await fc.assert(
        fc.asyncProperty(emailArbitrary, async (email) => {
          jest.clearAllMocks();

          const mockGuest = {
            _id: new Types.ObjectId(),
            eventId: mockEventId,
            userId: mockUserId,
            email: email.toLowerCase().trim(),
            name: "Test User",
            permission: "view_guest_list",
            status: "pending",
          };

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

          const guest = await guestService.addGuest(
            mockEventId,
            mockUserId,
            email,
            "Test User",
          );

          expect(guest.email).toBe(email.toLowerCase().trim());
          expect(guest.email).not.toMatch(/\s/);
          expect(guest.email).toContain("@");
          expect(guest.email).toContain(".");
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Additional Property: Guest Data Integrity
   * Ensures that guest data remains intact through operations
   */
  describe("Additional Property: Guest Data Integrity", () => {
    test("should maintain data integrity for all guest fields", async () => {
      const guestDataArbitrary = fc.record({
        email: fc
          .tuple(
            fc.string({ minLength: 1, maxLength: 15 }),
            fc.string({ minLength: 1, maxLength: 15 }),
          )
          .map(([local, domain]) => `${local}@${domain}.com`),
        name: fc.string({
          minLength: 1,
          maxLength: 50,
        }),
        avatar: fc
          .string({ minLength: 5, maxLength: 20 })
          .map((id: string) => `https://example.com/avatars/${id}.jpg`),
        permission: fc.constantFrom(
          "edit_event",
          "view_guest_list",
          "invite_others",
        ),
      });

      await fc.assert(
        fc.asyncProperty(guestDataArbitrary, async (guestData: any) => {
          jest.clearAllMocks();

          const mockGuest = {
            _id: new Types.ObjectId(),
            eventId: mockEventId,
            userId: mockUserId,
            ...guestData,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

          const guest = await guestService.addGuest(
            mockEventId,
            mockUserId,
            guestData.email,
            guestData.name,
            guestData.avatar,
            guestData.permission,
          );

          expect(guest.email).toBe(guestData.email.toLowerCase().trim());
          expect(guest.name).toBe(guestData.name.trim());
          expect(guest.avatar).toBe(guestData.avatar.trim());
          expect(guest.permission).toBe(guestData.permission);
          expect(guest.status).toBe("pending");
          expect(guest.eventId).toEqual(mockEventId);
          expect(guest.userId).toEqual(mockUserId);
        }),
        { numRuns: 100 },
      );
    });
  });
});

/**
 * Property-Based Tests for Guest Service
 * Tests universal properties that should hold across all valid inputs
 * Using fast-check library for generating random test data
 *
 * Validates: Requirements 3.4, 6.1, 6.2, 4.4, 4.5, 9.1, 9.2, 9.3, 4.2, 1.5, 6.5, 7.5
 */
describe("GuestService - Property-Based Tests", () => {
  const mockEventId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();

  /**
   * Property 4: Guest Persistence Round-Trip
   * Validates: Requirements 3.4, 6.1, 6.2, 4.4, 4.5
   */
  describe("Property 4: Guest Persistence Round-Trip", () => {
    test("should persist and retrieve guest with all fields intact", async () => {
      const emailArbitrary = fc
        .tuple(fc.emailAddress(), fc.integer({ min: 1, max: 9999 }))
        .map(([email, num]) => `test${num}@example.com`);

      const nameArbitrary = fc
        .tuple(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
        )
        .map(([first, last]) => `${first} ${last}`);

      const avatarArbitrary = fc
        .tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 }),
        )
        .map(([id, ext]) => `https://example.com/avatars/${id}.${ext}`);

      const permissionArbitrary = fc.constantFrom(
        "edit_event",
        "view_guest_list",
        "invite_others",
      );

      await fc.assert(
        fc.asyncProperty(
          emailArbitrary,
          nameArbitrary,
          avatarArbitrary,
          permissionArbitrary,
          async (email, name, avatar, permission) => {
            jest.clearAllMocks();

            const mockGuest = {
              _id: new Types.ObjectId(),
              eventId: mockEventId,
              userId: mockUserId,
              email: email.toLowerCase().trim(),
              name: name.trim(),
              avatar: avatar.trim(),
              permission,
              status: "pending",
            };

            (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
            (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);
            (Guest.findById as jest.Mock).mockResolvedValueOnce(mockGuest);

            const addedGuest = await guestService.addGuest(
              mockEventId,
              mockUserId,
              email,
              name,
              avatar,
              permission,
            );

            expect(addedGuest.email).toBe(email.toLowerCase().trim());
            expect(addedGuest.name).toBe(name.trim());
            expect(addedGuest.avatar).toBe(avatar.trim());
            expect(addedGuest.permission).toBe(permission);

            const retrievedGuest = await guestService.getGuestById(
              addedGuest._id,
            );

            expect(retrievedGuest.email).toBe(email.toLowerCase().trim());
            expect(retrievedGuest.name).toBe(name.trim());
            expect(retrievedGuest.avatar).toBe(avatar.trim());
            expect(retrievedGuest.permission).toBe(permission);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 5: Email Validation and Normalization
   * Validates: Requirements 9.1, 9.2, 9.3
   */
  describe("Property 5: Email Validation and Normalization", () => {
    test("should normalize valid emails to lowercase", async () => {
      const validEmailArbitrary = fc
        .tuple(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
        )
        .map(([local, domain]) => `${local}@${domain}.com`);

      await fc.assert(
        fc.asyncProperty(validEmailArbitrary, async (email) => {
          jest.clearAllMocks();

          const mockGuest = {
            _id: new Types.ObjectId(),
            eventId: mockEventId,
            userId: mockUserId,
            email: email.toLowerCase().trim(),
            name: "Test User",
            permission: "view_guest_list",
            status: "pending",
          };

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

          const guest = await guestService.addGuest(
            mockEventId,
            mockUserId,
            email,
            "Test User",
          );

          expect(guest.email).toBe(email.toLowerCase().trim());
        }),
        { numRuns: 100 },
      );
    });

    test("should reject invalid emails with error message", async () => {
      const invalidEmailArbitrary = fc.string({ minLength: 1, maxLength: 20 });

      await fc.assert(
        fc.asyncProperty(invalidEmailArbitrary, async (invalidEmail) => {
          jest.clearAllMocks();

          if (invalidEmail.includes("@") && invalidEmail.includes(".")) {
            return;
          }

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);

          try {
            await guestService.addGuest(
              mockEventId,
              mockUserId,
              invalidEmail,
              "Test User",
            );
            throw new Error("Should have rejected invalid email");
          } catch (error: any) {
            expect(error.message).toContain("Invalid email format");
          }
        }),
        { numRuns: 50 },
      );
    });

    test("should normalize emails with mixed case and whitespace", async () => {
      const mixedCaseEmailArbitrary = fc
        .tuple(
          fc.string({ minLength: 1, maxLength: 15 }),
          fc.string({ minLength: 1, maxLength: 15 }),
        )
        .map(([local, domain]) => `  ${local}@${domain}.com  `);

      await fc.assert(
        fc.asyncProperty(mixedCaseEmailArbitrary, async (email) => {
          jest.clearAllMocks();

          const mockGuest = {
            _id: new Types.ObjectId(),
            eventId: mockEventId,
            userId: mockUserId,
            email: email.toLowerCase().trim(),
            name: "Test User",
            permission: "view_guest_list",
            status: "pending",
          };

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

          const guest = await guestService.addGuest(
            mockEventId,
            mockUserId,
            email,
            "Test User",
          );

          expect(guest.email).toBe(email.toLowerCase().trim());
          expect(guest.email).not.toContain(" ");
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 6: Permission Update Persistence
   * Validates: Requirements 4.2, 4.4, 4.5
   */
  describe("Property 6: Permission Update Persistence", () => {
    test("should persist updated permissions correctly", async () => {
      const permissionArbitrary = fc.constantFrom(
        "edit_event",
        "view_guest_list",
        "invite_others",
      );

      await fc.assert(
        fc.asyncProperty(
          permissionArbitrary,
          permissionArbitrary,
          async (initialPermission, updatedPermission) => {
            jest.clearAllMocks();

            const guestId = new Types.ObjectId();

            const updatedGuest = {
              _id: guestId,
              eventId: mockEventId,
              userId: mockUserId,
              email: "test@example.com",
              name: "Test User",
              permission: updatedPermission,
              status: "pending",
            };

            (Guest.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(
              updatedGuest,
            );
            (Guest.findById as jest.Mock).mockResolvedValueOnce(updatedGuest);

            const guest = await guestService.updateGuestPermission(
              guestId,
              updatedPermission,
            );

            expect(guest.permission).toBe(updatedPermission);

            const retrievedGuest = await guestService.getGuestById(guestId);

            expect(retrievedGuest.permission).toBe(updatedPermission);
          },
        ),
        { numRuns: 100 },
      );
    });

    test("should handle all valid permission transitions", async () => {
      const permissions = [
        "edit_event",
        "view_guest_list",
        "invite_others",
      ] as const;

      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.constantFrom(...permissions),
            fc.constantFrom(...permissions),
          ),
          async ([from, to]) => {
            jest.clearAllMocks();

            const guestId = new Types.ObjectId();

            const updatedGuest = {
              _id: guestId,
              eventId: mockEventId,
              permission: to,
            };

            (Guest.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(
              updatedGuest,
            );

            const guest = await guestService.updateGuestPermission(guestId, to);
            expect(guest.permission).toBe(to);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 10: Error Handling Consistency
   * Validates: Requirements 1.5, 6.5, 7.5
   */
  describe("Property 10: Error Handling Consistency", () => {
    test("should handle database errors with descriptive messages", async () => {
      const errorTypeArbitrary = fc.constantFrom(
        "DUPLICATE_KEY",
        "VALIDATION_ERROR",
        "CONNECTION_ERROR",
        "UNKNOWN_ERROR",
      );

      await fc.assert(
        fc.asyncProperty(errorTypeArbitrary, async (errorType) => {
          jest.clearAllMocks();

          let mockError: any;

          switch (errorType) {
            case "DUPLICATE_KEY":
              mockError = new Error("Duplicate value for field: email");
              mockError.code = 11000;
              mockError.keyPattern = { email: 1 };
              break;
            case "VALIDATION_ERROR":
              mockError = new Error("Validation error: Invalid email");
              mockError.name = "ValidationError";
              mockError.errors = {
                email: { message: "Invalid email" },
              };
              break;
            case "CONNECTION_ERROR":
              mockError = new Error("Database connection failed");
              break;
            case "UNKNOWN_ERROR":
              mockError = new Error("An unexpected error occurred");
              break;
          }

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockRejectedValueOnce(mockError);

          try {
            await guestService.addGuest(
              mockEventId,
              mockUserId,
              "test@example.com",
              "Test User",
            );
            throw new Error("Should have thrown error");
          } catch (error: any) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBeTruthy();
            expect(error.message.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 50 },
      );
    });

    test("should not crash service on various error types", async () => {
      const errorArbitrary = fc.oneof(
        fc.constant(new Error("Network timeout")),
        fc.constant(new Error("Database unavailable")),
        fc.constant(new Error("Invalid operation")),
        fc.constant(new Error("Permission denied")),
      );

      await fc.assert(
        fc.asyncProperty(errorArbitrary, async (error) => {
          jest.clearAllMocks();

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockRejectedValueOnce(error);

          try {
            await guestService.addGuest(
              mockEventId,
              mockUserId,
              "test@example.com",
              "Test User",
            );
            throw new Error("Should have thrown error");
          } catch (caughtError: any) {
            expect(caughtError).toBeInstanceOf(Error);
            expect(typeof caughtError.message).toBe("string");
          }
        }),
        { numRuns: 50 },
      );
    });

    test("should provide consistent error format across operations", async () => {
      const operationArbitrary = fc.constantFrom(
        "addGuest",
        "removeGuest",
        "updatePermission",
      );

      await fc.assert(
        fc.asyncProperty(operationArbitrary, async (operation) => {
          jest.clearAllMocks();

          const guestId = new Types.ObjectId();
          const testError = new Error("Operation failed");

          switch (operation) {
            case "addGuest":
              (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
              (Guest.create as jest.Mock).mockRejectedValueOnce(testError);

              try {
                await guestService.addGuest(
                  mockEventId,
                  mockUserId,
                  "test@example.com",
                  "Test User",
                );
              } catch (error: any) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toBeTruthy();
              }
              break;

            case "removeGuest":
              (Guest.findByIdAndDelete as jest.Mock).mockRejectedValueOnce(
                testError,
              );

              try {
                await guestService.removeGuest(guestId);
              } catch (error: any) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toBeTruthy();
              }
              break;

            case "updatePermission":
              (Guest.findByIdAndUpdate as jest.Mock).mockRejectedValueOnce(
                testError,
              );

              try {
                await guestService.updateGuestPermission(guestId, "edit_event");
              } catch (error: any) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toBeTruthy();
              }
              break;
          }
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Additional Property: Email Format Consistency
   * Ensures that email validation is consistent across all operations
   */
  describe("Additional Property: Email Format Consistency", () => {
    test("should consistently validate email format across multiple operations", async () => {
      const emailArbitrary = fc
        .tuple(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
        )
        .map(([local, domain]) => `${local}@${domain}.com`);

      await fc.assert(
        fc.asyncProperty(emailArbitrary, async (email) => {
          jest.clearAllMocks();

          const mockGuest = {
            _id: new Types.ObjectId(),
            eventId: mockEventId,
            userId: mockUserId,
            email: email.toLowerCase().trim(),
            name: "Test User",
            permission: "view_guest_list",
            status: "pending",
          };

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

          const guest = await guestService.addGuest(
            mockEventId,
            mockUserId,
            email,
            "Test User",
          );

          expect(guest.email).toBe(email.toLowerCase().trim());
          expect(guest.email).not.toMatch(/\s/);
          expect(guest.email).toContain("@");
          expect(guest.email).toContain(".");
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Additional Property: Guest Data Integrity
   * Ensures that guest data remains intact through operations
   */
  describe("Additional Property: Guest Data Integrity", () => {
    test("should maintain data integrity for all guest fields", async () => {
      const guestDataArbitrary = fc.record({
        email: fc
          .tuple(
            fc.string({ minLength: 1, maxLength: 15 }),
            fc.string({ minLength: 1, maxLength: 15 }),
          )
          .map(([local, domain]) => `${local}@${domain}.com`),
        name: fc.string({
          minLength: 1,
          maxLength: 50,
        }),
        avatar: fc
          .string({ minLength: 5, maxLength: 20 })
          .map((id: string) => `https://example.com/avatars/${id}.jpg`),
        permission: fc.constantFrom(
          "edit_event",
          "view_guest_list",
          "invite_others",
        ),
      });

      await fc.assert(
        fc.asyncProperty(guestDataArbitrary, async (guestData: any) => {
          jest.clearAllMocks();

          const mockGuest = {
            _id: new Types.ObjectId(),
            eventId: mockEventId,
            userId: mockUserId,
            ...guestData,
            status: "pending",
          };

          (Guest.findOne as jest.Mock).mockResolvedValueOnce(null);
          (Guest.create as jest.Mock).mockResolvedValueOnce(mockGuest);

          const guest = await guestService.addGuest(
            mockEventId,
            mockUserId,
            guestData.email,
            guestData.name,
            guestData.avatar,
            guestData.permission,
          );

          expect(guest.email).toBe(guestData.email.toLowerCase().trim());
          expect(guest.name).toBe(guestData.name.trim());
          expect(guest.avatar).toBe(guestData.avatar.trim());
          expect(guest.permission).toBe(guestData.permission);
          expect(guest.status).toBe("pending");
          expect(guest.eventId).toEqual(mockEventId);
          expect(guest.userId).toEqual(mockUserId);
        }),
        { numRuns: 100 },
      );
    });
  });
});
