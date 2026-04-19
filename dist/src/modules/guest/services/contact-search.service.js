"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactSearchService = exports.ContactSearchService = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Contact Search Service
 * Handles integration with Google Contacts API for searching and retrieving contacts
 * Manages OAuth token refresh and error handling
 *
 * @class ContactSearchService
 */
class ContactSearchService {
    GOOGLE_PEOPLE_API_BASE_URL = "https://people.googleapis.com/v1";
    GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
    DEFAULT_PAGE_SIZE = 50;
    /**
     * Search contacts using Google Contacts API
     * Implements automatic token refresh on expiration
     *
     * @param userId - The user ID performing the search
     * @param searchTerm - The search term to query contacts
     * @param limit - Maximum number of results to return (default: 50)
     * @param offset - Pagination offset (default: 0)   * @returns Promise<Contact[]> - Array of matching contacts
     * @throws Error with descriptive message if search fails
     *
     * @example
     * const contacts = await contactSearchService.searchContacts(
     *   userId,
     *   "john",
     *   50,
     *   0
     * );
     */
    async searchContacts(userId, searchTerm, limit = this.DEFAULT_PAGE_SIZE, offset = 0) {
        try {
            // Validate search term
            if (!searchTerm || searchTerm.trim().length === 0) {
                return [];
            }
            // Get user with Google access token
            const user = await this.getUserWithToken(userId);
            if (!user?.googleAccessToken) {
                throw new Error("Google authentication required. Please connect your Google account.");
            }
            // Search contacts with token refresh on expiration
            let contacts = await this.searchContactsWithToken(user.googleAccessToken, searchTerm, limit, offset);
            // If token expired, refresh and retry
            if (contacts === null) {
                const newToken = await this.refreshGoogleToken(user);
                if (!newToken) {
                    throw new Error("Failed to refresh Google authentication. Please re-authenticate.");
                }
                contacts = await this.searchContactsWithToken(newToken, searchTerm, limit, offset);
                if (contacts === null) {
                    throw new Error("Failed to search contacts after token refresh");
                }
            }
            return contacts;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    /**
     * Search contacts using the provided access token
     * Calls Google People API to search for contacts by email or name
     * Returns null if token is expired (401 response)
     *
     * @private
     * @param accessToken - Google OAuth access token
     * @param searchTerm - The search term (email or name) to find contacts
     * @param limit - Maximum results
     * @param offset - Pagination offset
     * @returns Promise<Contact[] | null> - Contacts or null if token expired
     */
    async searchContactsWithToken(accessToken, searchTerm, limit, offset) {
        try {
            // Get all connections (contacts) from Google Contacts
            // Note: Google People API doesn't support direct email search,
            // so we fetch all contacts and filter client-side
            const response = await axios_1.default.get(`${this.GOOGLE_PEOPLE_API_BASE_URL}/people/me/connections`, {
                params: {
                    pageSize: 1000, // Fetch more to ensure we find the contact
                    personFields: "names,emailAddresses,photos,phoneNumbers",
                    sortOrder: "FIRST_NAME_ASCENDING",
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                timeout: 10000, // 10 second timeout
            });
            // Parse contacts from response
            const allContacts = this.parseContactsFromResponse(response.data);
            // Filter contacts by search term (name or email)
            // Search is case-insensitive and matches partial strings
            const filteredContacts = allContacts.filter((contact) => {
                const searchLower = searchTerm.toLowerCase();
                return (contact.name.toLowerCase().includes(searchLower) ||
                    contact.email.toLowerCase().includes(searchLower));
            });
            console.log(`[ContactSearchService] Search term: ${searchTerm}, Found: ${filteredContacts.length} contacts`);
            // If no contacts found and search term looks like an email, create a placeholder contact
            if (filteredContacts.length === 0 && this.isValidEmail(searchTerm)) {
                console.log(`[ContactSearchService] Creating placeholder contact for email: ${searchTerm}`);
                const placeholderContact = {
                    id: `email_${searchTerm}`,
                    email: searchTerm.toLowerCase(),
                    name: searchTerm.split("@")[0], // Use email prefix as name
                    avatar: undefined, // No avatar for non-Google contacts
                };
                return [placeholderContact];
            }
            // Apply pagination
            const paginatedContacts = filteredContacts.slice(offset, offset + limit);
            return paginatedContacts;
        }
        catch (error) {
            const axiosError = error;
            console.error(`[ContactSearchService] Error searching contacts:`, axiosError.message);
            // Return null if token expired (401 Unauthorized)
            if (axiosError.response?.status === 401) {
                return null;
            }
            // If Google Contacts API fails but search term is valid email, return placeholder
            if (this.isValidEmail(searchTerm)) {
                console.log(`[ContactSearchService] Google API failed, creating placeholder contact for email: ${searchTerm}`);
                const placeholderContact = {
                    id: `email_${searchTerm}`,
                    email: searchTerm.toLowerCase(),
                    name: searchTerm.split("@")[0],
                    avatar: undefined,
                };
                return [placeholderContact];
            }
            // Re-throw other errors
            throw error;
        }
    }
    /**
     * Parse contacts from Google People API response
     *
     * @private
     * @param responseData - Raw response from Google API
     * @returns Contact[] - Parsed contacts
     */
    parseContactsFromResponse(responseData) {
        if (!responseData.connections || !Array.isArray(responseData.connections)) {
            return [];
        }
        return responseData.connections
            .map((person) => {
            if (!person)
                return null;
            const email = person.emailAddresses?.[0]?.value;
            if (!email)
                return null; // Skip contacts without email
            const name = person.names?.[0]?.displayName || email.split("@")[0]; // Fallback to email prefix
            const avatar = person.photos?.[0]?.url;
            const phoneNumbers = person.phoneNumbers?.map((phone) => phone.canonicalForm || phone.value);
            const contact = {
                id: person.resourceName || email, // Use resourceName as ID
                email: email.toLowerCase(),
                name,
                avatar: avatar || null, // Use null instead of undefined
                phoneNumbers: phoneNumbers || [],
            };
            console.log(`[ContactSearchService] Parsed contact: ${contact.name} (${contact.email}) - Avatar: ${contact.avatar ? "YES" : "NO"}`);
            return contact;
        })
            .filter((contact) => contact !== null);
    }
    /**
     * Refresh expired Google OAuth token
     * Updates the user's token in the database
     *
     * @private
     * @param user - User document with refresh token info
     * @returns Promise<string | null> - New access token or null if refresh fails
     */
    async refreshGoogleToken(user) {
        try {
            // Note: This is a simplified implementation
            // In production, you would need to store the refresh token
            // and use it to get a new access token
            // For now, we'll return null to indicate token refresh is not available
            console.warn(`[ContactSearchService] Token refresh not implemented for user ${user._id}`);
            return null;
        }
        catch (error) {
            console.error("[ContactSearchService] Token refresh failed:", error);
            return null;
        }
    }
    /**
     * Get user with Google access token
     * Retrieves user from database with token field selected
     *
     * @private
     * @param userId - The user ID
     * @returns Promise<any> - User document with token
     */
    async getUserWithToken(userId) {
        try {
            // Import User model dynamically to avoid circular dependencies
            const { User: UserModel } = await Promise.resolve().then(() => __importStar(require("../../auth/auth.model")));
            const user = await UserModel.findById(userId).select("+googleAccessToken");
            if (!user) {
                throw new Error("User not found");
            }
            return user;
        }
        catch (error) {
            throw new Error(`Failed to retrieve user: ${error.message}`);
        }
    }
    /**
     * Handle and format errors from Google API or internal operations
     *
     * @private
     * @param error - The error object
     * @returns Error - Formatted error with descriptive message
     */
    handleError(error) {
        const axiosError = error;
        // Handle Google API errors
        if (axiosError.response) {
            const status = axiosError.response.status;
            const data = axiosError.response.data;
            switch (status) {
                case 400:
                    return new Error(`Invalid search request: ${data?.error?.message || "Bad request"}`);
                case 401:
                    return new Error("Google authentication expired. Please re-authenticate.");
                case 403:
                    return new Error("Permission denied to access Google Contacts. Please check your Google account permissions.");
                case 429:
                    return new Error("Too many requests to Google API. Please try again later.");
                case 500:
                case 503:
                    return new Error("Google Contacts service is temporarily unavailable. Please try again later.");
                default:
                    return new Error(`Google API error: ${data?.error?.message || "Unknown error"}`);
            }
        }
        // Handle network errors
        if (axiosError.code === "ECONNABORTED") {
            return new Error("Request timeout. Please check your internet connection.");
        }
        if (axiosError.code === "ENOTFOUND" || axiosError.code === "ECONNREFUSED") {
            return new Error("Network error. Please check your internet connection.");
        }
        // Handle custom errors
        if (error instanceof Error) {
            return error;
        }
        // Handle unknown errors
        return new Error("An unexpected error occurred while searching contacts");
    }
    /**
     * Validate email format
     * Checks if email matches the standard email pattern
     *
     * @private
     * @param email - Email address to validate
     * @returns boolean - True if email is valid, false otherwise
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}
exports.ContactSearchService = ContactSearchService;
// Export singleton instance
exports.contactSearchService = new ContactSearchService();
