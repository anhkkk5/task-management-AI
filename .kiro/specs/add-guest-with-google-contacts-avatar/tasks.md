# Implementation Plan: Add Guest with Google Contacts Avatar

## Overview

This implementation plan breaks down the feature into discrete, incremental coding tasks that build upon each other. The tasks follow a layered approach: database schema → backend services → API endpoints → frontend components → integration and testing.

The implementation uses **TypeScript** for all code, following the existing project patterns and conventions.

---

## Tasks

### Phase 1: Database Schema and Models

- [x] 1. Create Guest MongoDB schema and model
  - Create `src/modules/guest/models/guest.model.ts` with Mongoose schema
  - Define Guest interface with all required fields (email, name, avatar, permission, status)
  - Add compound index for duplicate prevention (eventId + email)
  - Add indexes for efficient queries (userId, eventId)
  - Implement email normalization (lowercase, trim)
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 2. Update Event/Task model to include guest references
  - Add guests array field to existing Task model
  - Include guest summary information (email, name, avatar, permission)
  - Ensure backward compatibility with existing events
  - _Requirements: 6.1, 6.2_

---

### Phase 2: Backend Services

- [x] 3. Create Contact Search Service
  - Create `src/modules/guest/services/contact-search.service.ts`
  - Implement `searchContacts(userId, searchTerm, limit, offset)` method
  - Integrate with Google Contacts API using existing OAuth tokens
  - Implement token refresh logic for expired tokens
  - Handle API errors with descriptive messages
  - Return Contact objects with id, email, name, avatar, phoneNumbers
  - _Requirements: 1.2, 1.5, 7.1, 7.4, 7.5_

- [x] 4. Create Guest Service
  - Create `src/modules/guest/services/guest.service.ts`
  - Implement `addGuest(eventId, userId, email, name, avatar, permission)` method
  - Implement email validation and normalization (lowercase)
  - Implement duplicate prevention check
  - Implement `removeGuest(guestId)` method
  - Implement `updateGuestPermission(guestId, permission)` method
  - Implement `getEventGuests(eventId)` method
  - Implement `getGuestById(guestId)` method
  - _Requirements: 3.1, 3.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 9.1, 9.2, 9.3_

- [x] 5. Create Guest Repository
  - Create `src/modules/guest/repositories/guest.repository.ts`
  - Implement CRUD operations for Guest model
  - Implement `findByEventAndEmail(eventId, email)` for duplicate detection
  - Implement `findByEventId(eventId)` for retrieving all event guests
  - Implement `deleteByEventAndEmail(eventId, email)` for guest removal
  - Handle database errors with descriptive messages
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

---

### Phase 3: Backend API Endpoints

- [x] 6. Create Guest Controller
  - Create `src/modules/guest/controllers/guest.controller.ts`
  - Implement `searchContacts(req, res)` endpoint handler
  - Implement `addGuest(req, res)` endpoint handler
  - Implement `removeGuest(req, res)` endpoint handler
  - Implement `updateGuestPermission(req, res)` endpoint handler
  - Implement `getEventGuests(req, res)` endpoint handler
  - Add proper error handling and response formatting
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 3.1, 3.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Create Guest Routes
  - Create `src/modules/guest/routes/guest.routes.ts`
  - Define route: `GET /api/guests/search?q=<term>&limit=50&offset=0`
  - Define route: `POST /api/guests/add`
  - Define route: `DELETE /api/guests/:guestId`
  - Define route: `PUT /api/guests/:guestId/permission`
  - Define route: `GET /api/events/:eventId/guests`
  - Add authentication middleware to all routes
  - Register routes in main Express app
  - _Requirements: 1.1, 1.2, 3.1, 3.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4_

- [x] 8. Add input validation middleware
  - Create `src/modules/guest/middleware/guest-validation.middleware.ts`
  - Validate email format in add/update operations
  - Validate permission values against allowed permissions
  - Validate search term length and format
  - Validate pagination parameters (limit, offset)
  - Return 400 Bad Request with descriptive error messages
  - _Requirements: 9.1, 9.2, 9.3_

---

### Phase 4: Frontend Components

- [x] 9. Create ContactSearch Component
  - Create `src/components/GuestManager/ContactSearch.tsx`
  - Implement search input field with debouncing (300ms)
  - Implement API call to `/api/guests/search` on input change
  - Display search results as list of Contact items
  - Show loading state during search
  - Show error message if search fails
  - Implement pagination for 50+ results
  - Prevent selection of duplicate guests (gray out)
  - Handle empty search results with placeholder message
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.1, 8.2, 8.3, 8.4_

- [x] 10. Create GuestList Component
  - Create `src/components/GuestManager/GuestList.tsx`
  - Display list of added guests with avatar, name, email, permission
  - Implement hover actions (edit, remove buttons)
  - Show empty state message when no guests added
  - Call `onRemoveGuest` callback when remove button clicked
  - Call `onUpdatePermission` callback when permission changed
  - Handle read-only mode (disable actions)
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 11. Create PermissionSelector Component
  - Create `src/components/GuestManager/PermissionSelector.tsx`
  - Display dropdown/select with available permissions
  - Show current permission as selected value
  - Implement `onPermissionChange` callback on selection
  - Support permissions: "edit_event", "view_guest_list", "invite_others"
  - Display user-friendly permission labels
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 12. Create GuestManager Container Component
  - Create `src/components/GuestManager/GuestManager.tsx`
  - Implement state management for guests, search results, loading, error
  - Integrate ContactSearch, GuestList, PermissionSelector components
  - Implement `handleSearch(term)` to call backend search API
  - Implement `handleSelectContact(contact)` to add guest
  - Implement `handleRemoveGuest(guestId)` to remove guest
  - Implement `handleUpdatePermission(guestId, permission)` to update permission
  - Load existing guests on component mount
  - Handle API errors with user-friendly messages
  - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 10.1, 10.2, 10.3, 10.4_

---

### Phase 5: Integration and Wiring

- [x] 13. Integrate GuestManager into Calendar/Event page
  - Import GuestManager component into event creation/editing page
  - Pass eventId and callbacks to GuestManager
  - Display GuestManager in event form
  - Ensure guest data is included when saving event
  - Load and display existing guests when editing event
  - _Requirements: 3.1, 3.4, 4.4, 6.1, 6.2, 10.1, 10.2, 10.3, 10.4_

- [x] 14. Update Event API to include guests
  - Modify `PUT /api/events/:id` endpoint to accept guests array
  - Modify `GET /api/events/:id` endpoint to return guests array
  - Ensure guest information is persisted with event
  - Ensure guest information is retrieved with event
  - _Requirements: 3.4, 4.4, 6.1, 6.2, 6.3, 6.4_

---

### Phase 6: Testing - Backend

- [x] 15. Write unit tests for Contact Search Service
  - Create `src/modules/guest/services/__tests__/contact-search.service.test.ts`
  - Test `searchContacts` with valid search term
  - Test `searchContacts` with empty search term
  - Test `searchContacts` with special characters
  - Test token refresh on expired token
  - Test error handling for Google API failures
  - Test pagination parameters (limit, offset)
  - _Requirements: 1.2, 1.5, 7.1, 7.4, 7.5_

- [x] 16. Write unit tests for Guest Service
  - Create `src/modules/guest/services/__tests__/guest.service.test.ts`
  - Test `addGuest` with valid email
  - Test `addGuest` with invalid email format
  - Test `addGuest` with duplicate guest (should fail)
  - Test email normalization (lowercase)
  - Test `removeGuest` removes guest from database
  - Test `updateGuestPermission` updates permission
  - Test `getEventGuests` returns all guests for event
  - _Requirements: 3.1, 3.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 9.1, 9.2, 9.3_

- [x] 17. Write unit tests for Guest Repository
  - Create `src/modules/guest/repositories/__tests__/guest.repository.test.ts`
  - Test CRUD operations (create, read, update, delete)
  - Test `findByEventAndEmail` for duplicate detection
  - Test `findByEventId` returns all guests
  - Test database error handling
  - Test compound index prevents duplicates
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 18. Write unit tests for Guest Controller
  - Create `src/modules/guest/controllers/__tests__/guest.controller.test.ts`
  - Test `searchContacts` endpoint returns correct response format
  - Test `addGuest` endpoint with valid data
  - Test `addGuest` endpoint with invalid email
  - Test `addGuest` endpoint with duplicate guest
  - Test `removeGuest` endpoint
  - Test `updateGuestPermission` endpoint
  - Test `getEventGuests` endpoint
  - Test error responses with descriptive messages
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 3.1, 3.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 19. Write property-based tests for backend
  - Create `src/modules/guest/services/__tests__/guest.service.properties.test.ts`
  - **Property 4: Guest Persistence Round-Trip**
    - Generate random guests with email, name, avatar
    - Add guest to event
    - Retrieve guest from database
    - Verify all fields match original values
    - **Validates: Requirements 3.4, 6.1, 6.2, 4.4, 4.5**
  - **Property 5: Email Validation and Normalization**
    - Generate random email addresses (valid and invalid)
    - Validate each email
    - Verify valid emails normalized to lowercase
    - Verify invalid emails rejected with error
    - **Validates: Requirements 9.1, 9.2, 9.3**
  - **Property 6: Permission Update Persistence**
    - Generate random guests with random permissions
    - Update each guest's permission
    - Retrieve guest from database
    - Verify permission matches updated value
    - **Validates: Requirements 4.2, 4.4, 4.5**
  - **Property 10: Error Handling Consistency**
    - Mock various API errors (Google API, database)
    - Verify error responses contain descriptive messages
    - Verify error handling doesn't crash service
    - **Validates: Requirements 1.5, 6.5, 7.5**

---

### Phase 7: Testing - Frontend

- [ ] 20. Write unit tests for ContactSearch Component
  - Create `src/components/GuestManager/__tests__/ContactSearch.test.tsx`
  - Test search input renders correctly
  - Test debouncing of search requests (300ms)
  - Test API call on search term change
  - Test search results display correctly
  - Test loading state during search
  - Test error message display on API failure
  - Test pagination for 50+ results
  - Test duplicate guests grayed out
  - Test empty search results placeholder
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.1, 8.2, 8.3, 8.4_

- [ ] 21. Write unit tests for GuestList Component
  - Create `src/components/GuestManager/__tests__/GuestList.test.tsx`
  - Test guest list renders all guests
  - Test each guest displays avatar, name, email, permission
  - Test hover actions (edit, remove buttons)
  - Test empty state message
  - Test remove button calls callback
  - Test permission change calls callback
  - Test read-only mode disables actions
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 22. Write unit tests for PermissionSelector Component
  - Create `src/components/GuestManager/__tests__/PermissionSelector.test.tsx`
  - Test dropdown displays all permissions
  - Test current permission selected
  - Test permission change calls callback
  - Test user-friendly permission labels display
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 23. Write unit tests for GuestManager Component
  - Create `src/components/GuestManager/__tests__/GuestManager.test.tsx`
  - Test component renders search and guest list
  - Test search functionality
  - Test adding guest to list
  - Test removing guest from list
  - Test updating guest permission
  - Test loading existing guests on mount
  - Test error handling and display
  - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 10.1, 10.2, 10.3, 10.4_

- [ ] 24. Write property-based tests for frontend
  - Create `src/components/GuestManager/__tests__/GuestManager.properties.test.tsx`
  - **Property 1: Contact Display Completeness**
    - Generate random contacts with varying avatar/name presence
    - Render contact list
    - Verify all contacts display with required information
    - Verify placeholders display when data missing
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
  - **Property 2: Guest Addition Idempotence**
    - Generate random guests
    - Add guest to event
    - Attempt to add same guest again
    - Verify duplicate prevention error
    - Verify guest list unchanged
    - **Validates: Requirements 3.5**
  - **Property 3: Guest Removal Round-Trip**
    - Generate random guests
    - Add guests to event
    - Remove each guest
    - Verify guest removed from list
    - Verify contact available in search again
    - **Validates: Requirements 5.1, 5.3**
  - **Property 7: Search Result Rendering**
    - Generate random contact lists (0-100+ contacts)
    - Render contact list
    - Verify all contacts displayed correctly
    - Verify no contacts missing or duplicated
    - **Validates: Requirements 1.3, 2.1, 2.2, 2.3**
  - **Property 8: Debounce Effectiveness**
    - Generate rapid sequence of search inputs
    - Verify only one API call made within 300ms window
    - Verify final search term used for API call
    - **Validates: Requirements 8.3**
  - **Property 9: Pagination Handling**
    - Generate search results with 50+ contacts
    - Verify pagination implemented
    - Verify all contacts accessible through pagination
    - **Validates: Requirements 8.4**
  - **Property 11: Guest List Display Completeness**
    - Generate random guests with all information
    - Display guest list
    - Verify all guest information displayed
    - Verify no information missing
    - **Validates: Requirements 10.2**
  - **Property 12: Token Refresh Automation**
    - Mock expired token scenario
    - Verify token refresh called automatically
    - Verify API call retried after refresh
    - Verify no user intervention required
    - **Validates: Requirements 7.4**

---

### Phase 8: Integration Testing

- [ ] 25. Write end-to-end integration tests
  - Create `src/modules/guest/__tests__/guest.integration.test.ts`
  - Test complete flow: search contact → add guest → verify in database
  - Test complete flow: add guest → update permission → verify in database
  - Test complete flow: add guest → remove guest → verify removed from database
  - Test complete flow: add guest → save event → load event → verify guest persisted
  - Test error scenarios: invalid email, duplicate guest, API failure
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 3.1, 3.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.4, 7.5_

- [ ] 26. Write Google Contacts API integration tests
  - Create `src/modules/guest/__tests__/google-contacts-integration.test.ts`
  - Test authentication with Google OAuth
  - Test search contacts API call
  - Test handling of API errors
  - Test token refresh on expiration
  - Test pagination of results
  - Mock Google API responses
  - _Requirements: 1.2, 1.5, 7.1, 7.4, 7.5_

- [ ] 27. Checkpoint - Ensure all tests pass
  - Run all unit tests: `npm run test:unit`
  - Run all integration tests: `npm run test:integration`
  - Run all property-based tests: `npm run test:properties`
  - Verify test coverage meets 80% threshold
  - Fix any failing tests
  - Ask the user if questions arise

---

### Phase 9: Documentation and Final Integration

- [ ] 28. Update API documentation
  - Create `docs/api/guests.md` with endpoint documentation
  - Document all 5 endpoints with request/response examples
  - Document error responses and error codes
  - Document authentication requirements
  - Document rate limiting
  - Update OpenAPI/Swagger specification
  - _Requirements: 1.1, 1.2, 3.1, 3.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4_

- [ ] 29. Add component documentation
  - Create `docs/components/GuestManager.md` with component documentation
  - Document GuestManager, ContactSearch, GuestList, PermissionSelector components
  - Include usage examples and props documentation
  - Document state management and callbacks
  - _Requirements: 1.1, 3.1, 4.1, 10.1, 10.2, 10.3, 10.4_

- [ ] 30. Final integration and verification
  - Verify GuestManager component integrated into event page
  - Verify guest data flows correctly through entire system
  - Verify all API endpoints working correctly
  - Verify database persistence working correctly
  - Verify error handling working correctly
  - Test complete user workflow end-to-end
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 10.4_

- [ ] 31. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise

---

## Implementation Notes

### Task Dependencies

- Phase 1 (Database) must complete before Phase 2 (Services)
- Phase 2 (Services) must complete before Phase 3 (API Endpoints)
- Phase 3 (API Endpoints) must complete before Phase 4 (Frontend)
- Phase 4 (Frontend) must complete before Phase 5 (Integration)
- Phase 5 (Integration) must complete before Phase 6-7 (Testing)
- Phase 6-7 (Testing) must complete before Phase 8 (Integration Testing)
- Phase 8 (Integration Testing) must complete before Phase 9 (Documentation)

### Testing Strategy

- **Unit Tests**: Test individual components and services in isolation
- **Property-Based Tests**: Test universal properties across random inputs
- **Integration Tests**: Test complete workflows across multiple components
- **Test Framework**: Jest with fast-check for property-based testing
- **Coverage Target**: 80%+ for critical paths

### Optional Tasks

Tasks marked with `*` are optional and can be skipped for faster MVP:

- All test-related sub-tasks (marked with `*` in the task list)
- Documentation tasks (Phase 9)

However, **core implementation tasks (Phases 1-5) are mandatory** and must be completed for the feature to function.

### Code Quality Standards

- Follow existing project conventions and patterns
- Use TypeScript with strict type checking
- Add JSDoc comments for public APIs
- Implement proper error handling
- Use dependency injection for services
- Write clean, readable code with meaningful variable names
- Follow DRY (Don't Repeat Yourself) principle

### Performance Considerations

- Debounce search requests (300ms) to reduce API calls
- Implement pagination for 50+ results
- Use database indexes for efficient queries
- Cache Google Contacts API responses (with TTL)
- Lazy load guest avatars
- Minimize re-renders in React components

### Security Considerations

- Validate all email inputs
- Sanitize user inputs to prevent injection
- Use HTTPS for all API calls
- Store Google access tokens securely
- Implement rate limiting for API endpoints
- Verify user ownership of event before modifying guests
- Use authentication middleware on all endpoints
