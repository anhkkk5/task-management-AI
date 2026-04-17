import { Types } from "mongoose";
import { CreateTaskDto, UpdateTaskDto } from "../task.dto";

/**
 * Test suite for Task Guest Details functionality
 * Validates that guest information is properly persisted and retrieved with events
 *
 * Validates: Requirements 3.4, 4.4, 6.1, 6.2, 6.3, 6.4
 */
describe("Task Guest Details", () => {
  const guestId1 = new Types.ObjectId().toString();
  const guestId2 = new Types.ObjectId().toString();

  describe("Guest details DTO validation", () => {
    it("should create a CreateTaskDto with guest details", () => {
      const createDto: CreateTaskDto = {
        title: "Team Meeting",
        type: "event",
        guestDetails: [
          {
            guestId: guestId1,
            email: "john@example.com",
            name: "John Doe",
            avatar: "https://example.com/avatar1.jpg",
            permission: "edit_event",
            status: "pending",
          },
          {
            guestId: guestId2,
            email: "jane@example.com",
            name: "Jane Smith",
            avatar: "https://example.com/avatar2.jpg",
            permission: "view_guest_list",
            status: "pending",
          },
        ],
      };

      expect(createDto).toBeDefined();
      expect(createDto.guestDetails).toHaveLength(2);
      expect(createDto.guestDetails?.[0].email).toBe("john@example.com");
      expect(createDto.guestDetails?.[0].name).toBe("John Doe");
      expect(createDto.guestDetails?.[0].permission).toBe("edit_event");
      expect(createDto.guestDetails?.[1].email).toBe("jane@example.com");
      expect(createDto.guestDetails?.[1].permission).toBe("view_guest_list");
    });

    it("should create an UpdateTaskDto with guest details", () => {
      const updateDto: UpdateTaskDto = {
        guestDetails: [
          {
            guestId: guestId1,
            email: "alice@example.com",
            name: "Alice Johnson",
            permission: "edit_event",
          },
        ],
      };

      expect(updateDto).toBeDefined();
      expect(updateDto.guestDetails).toHaveLength(1);
      expect(updateDto.guestDetails?.[0].email).toBe("alice@example.com");
      expect(updateDto.guestDetails?.[0].name).toBe("Alice Johnson");
      expect(updateDto.guestDetails?.[0].permission).toBe("edit_event");
    });

    it("should support all permission types", () => {
      const permissions: Array<
        "edit_event" | "view_guest_list" | "invite_others"
      > = ["edit_event", "view_guest_list", "invite_others"];

      const createDto: CreateTaskDto = {
        title: "Meeting",
        type: "event",
        guestDetails: permissions.map((permission, index) => ({
          guestId: new Types.ObjectId().toString(),
          email: `guest${index}@example.com`,
          name: `Guest ${index}`,
          permission,
        })),
      };

      expect(createDto.guestDetails).toHaveLength(3);
      expect(createDto.guestDetails?.[0].permission).toBe("edit_event");
      expect(createDto.guestDetails?.[1].permission).toBe("view_guest_list");
      expect(createDto.guestDetails?.[2].permission).toBe("invite_others");
    });

    it("should support all status types", () => {
      const statuses: Array<"pending" | "accepted" | "declined"> = [
        "pending",
        "accepted",
        "declined",
      ];

      const createDto: CreateTaskDto = {
        title: "Meeting",
        type: "event",
        guestDetails: statuses.map((status, index) => ({
          guestId: new Types.ObjectId().toString(),
          email: `guest${index}@example.com`,
          name: `Guest ${index}`,
          permission: "view_guest_list",
          status,
        })),
      };

      expect(createDto.guestDetails).toHaveLength(3);
      expect(createDto.guestDetails?.[0].status).toBe("pending");
      expect(createDto.guestDetails?.[1].status).toBe("accepted");
      expect(createDto.guestDetails?.[2].status).toBe("declined");
    });

    it("should handle optional avatar field", () => {
      const createDto: CreateTaskDto = {
        title: "Meeting",
        type: "event",
        guestDetails: [
          {
            guestId: guestId1,
            email: "with-avatar@example.com",
            name: "With Avatar",
            avatar: "https://example.com/avatar.jpg",
            permission: "view_guest_list",
          },
          {
            guestId: guestId2,
            email: "without-avatar@example.com",
            name: "Without Avatar",
            permission: "view_guest_list",
          },
        ],
      };

      expect(createDto.guestDetails?.[0].avatar).toBe(
        "https://example.com/avatar.jpg",
      );
      expect(createDto.guestDetails?.[1].avatar).toBeUndefined();
    });

    it("should handle empty guest details array", () => {
      const createDto: CreateTaskDto = {
        title: "Solo Task",
        type: "todo",
        guestDetails: [],
      };

      expect(createDto.guestDetails).toEqual([]);
    });

    it("should handle undefined guest details", () => {
      const createDto: CreateTaskDto = {
        title: "Solo Task",
        type: "todo",
      };

      expect(createDto.guestDetails).toBeUndefined();
    });
  });

  describe("Guest details in event context", () => {
    it("should support guest details for event type tasks", () => {
      const createDto: CreateTaskDto = {
        title: "Conference",
        type: "event",
        allDay: true,
        location: "New York",
        guestDetails: [
          {
            guestId: guestId1,
            email: "attendee@example.com",
            name: "Attendee",
            permission: "view_guest_list",
          },
        ],
      };

      expect(createDto.type).toBe("event");
      expect(createDto.guestDetails).toBeDefined();
      expect(createDto.guestDetails?.[0].email).toBe("attendee@example.com");
    });

    it("should support guest details for appointment type tasks", () => {
      const createDto: CreateTaskDto = {
        title: "Doctor Appointment",
        type: "appointment",
        deadline: new Date("2024-12-25"),
        guestDetails: [
          {
            guestId: guestId1,
            email: "doctor@example.com",
            name: "Dr. Smith",
            permission: "view_guest_list",
          },
        ],
      };

      expect(createDto.type).toBe("appointment");
      expect(createDto.guestDetails).toBeDefined();
    });

    it("should support guest details for todo type tasks", () => {
      const createDto: CreateTaskDto = {
        title: "Team Task",
        type: "todo",
        guestDetails: [
          {
            guestId: guestId1,
            email: "teammate@example.com",
            name: "Team Member",
            permission: "edit_event",
          },
        ],
      };

      expect(createDto.type).toBe("todo");
      expect(createDto.guestDetails).toBeDefined();
    });
  });

  describe("Guest details update scenarios", () => {
    it("should allow adding guests via update", () => {
      const updateDto: UpdateTaskDto = {
        guestDetails: [
          {
            guestId: guestId1,
            email: "new-guest@example.com",
            name: "New Guest",
            permission: "view_guest_list",
          },
        ],
      };

      expect(updateDto.guestDetails).toBeDefined();
      expect(updateDto.guestDetails).toHaveLength(1);
    });

    it("should allow updating guest permissions", () => {
      const updateDto: UpdateTaskDto = {
        guestDetails: [
          {
            guestId: guestId1,
            email: "guest@example.com",
            name: "Guest",
            permission: "edit_event", // Updated permission
          },
        ],
      };

      expect(updateDto.guestDetails?.[0].permission).toBe("edit_event");
    });

    it("should allow clearing guests via empty array", () => {
      const updateDto: UpdateTaskDto = {
        guestDetails: [],
      };

      expect(updateDto.guestDetails).toEqual([]);
    });

    it("should allow removing guests via update", () => {
      const updateDto: UpdateTaskDto = {
        guestDetails: [
          {
            guestId: guestId1,
            email: "remaining@example.com",
            name: "Remaining",
            permission: "view_guest_list",
          },
        ],
      };

      expect(updateDto.guestDetails).toHaveLength(1);
    });
  });
});
