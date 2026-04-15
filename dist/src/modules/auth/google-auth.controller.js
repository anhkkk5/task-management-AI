"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGoogleStatus = exports.createMeetLink = exports.getContactByEmail = exports.searchContacts = exports.getGoogleUserInfo = void 0;
const axios_1 = __importDefault(require("axios"));
// Get Google user info using stored access token
const getGoogleUserInfo = async (req, res) => {
    try {
        // ✅ FIX: Use req.user from middleware instead of parsing token again
        const googleAccessToken = req.user?.googleAccessToken;
        if (!googleAccessToken) {
            res.status(401).json({ message: "Chưa đăng nhập Google" });
            return;
        }
        const response = await axios_1.default.get("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: {
                Authorization: `Bearer ${googleAccessToken}`,
            },
        });
        res.json(response.data);
    }
    catch (error) {
        console.error("Failed to get Google user info:", error);
        res.status(500).json({
            message: "Không thể lấy thông tin Google",
            error: error.message,
        });
    }
};
exports.getGoogleUserInfo = getGoogleUserInfo;
// Search contacts by email (People API proxy)
const searchContacts = async (req, res) => {
    try {
        const { query } = req.query;
        // ✅ FIX: Use req.user from middleware instead of parsing token again
        const googleAccessToken = req.user?.googleAccessToken;
        if (!googleAccessToken) {
            res.status(401).json({ message: "Chưa đăng nhập Google" });
            return;
        }
        // Search in user's contacts
        const response = await axios_1.default.get(`https://people.googleapis.com/v1/people:searchContacts`, {
            params: {
                query: query,
                pageSize: 10,
            },
            headers: {
                Authorization: `Bearer ${googleAccessToken}`,
            },
        });
        const contacts = response.data.results?.map((result) => {
            const person = result.person;
            return {
                email: person.emailAddresses?.[0]?.value || "",
                name: person.names?.[0]?.displayName || "",
                photoUrl: person.photos?.[0]?.url,
            };
        }) || [];
        res.json(contacts);
    }
    catch (error) {
        console.error("Failed to search contacts:", error);
        // Return empty array instead of error for better UX
        res.json([]);
    }
};
exports.searchContacts = searchContacts;
// Get contact by email
const getContactByEmail = async (req, res) => {
    try {
        const { email } = req.params;
        // ✅ FIX: Use req.user from middleware instead of parsing token again
        const googleAccessToken = req.user?.googleAccessToken;
        if (!googleAccessToken) {
            res.status(401).json({ message: "Chưa đăng nhập Google" });
            return;
        }
        // Try to search for contact
        try {
            const response = await axios_1.default.get(`https://people.googleapis.com/v1/people:searchContacts`, {
                params: {
                    query: email,
                    pageSize: 10,
                },
                headers: {
                    Authorization: `Bearer ${googleAccessToken}`,
                },
            });
            const match = response.data.results?.find((result) => {
                const personEmail = result.person?.emailAddresses?.[0]?.value;
                return (personEmail?.toLowerCase() ===
                    email.toLowerCase());
            });
            if (match) {
                const person = match.person;
                res.json({
                    email,
                    name: person.names?.[0]?.displayName || email.split("@")[0],
                    photoUrl: person.photos?.[0]?.url,
                });
                return;
            }
        }
        catch {
            // Ignore search error
        }
        // Return basic info if not found
        res.json({
            email,
            name: email.split("@")[0],
        });
    }
    catch (error) {
        console.error("Failed to get contact:", error);
        res.status(500).json({
            message: "Không thể lấy thông tin liên hệ",
            error: error.message,
        });
    }
};
exports.getContactByEmail = getContactByEmail;
// Create Google Calendar event with Meet link
const createMeetLink = async (req, res) => {
    try {
        const { title, description, startTime, endTime, guests } = req.body;
        // ✅ FIX: Use req.user from middleware instead of parsing token again
        const googleAccessToken = req.user?.googleAccessToken;
        console.log("[createMeetLink] DEBUG:", {
            hasUser: !!req.user,
            userId: req.user?.userId,
            email: req.user?.email,
            hasGoogleAccessToken: !!googleAccessToken,
            googleAccessTokenLength: googleAccessToken?.length,
        });
        if (!googleAccessToken) {
            res.status(401).json({ message: "Chưa đăng nhập Google" });
            return;
        }
        const event = {
            summary: title,
            description: description || "",
            start: {
                dateTime: startTime,
                timeZone: "Asia/Ho_Chi_Minh",
            },
            end: {
                dateTime: endTime,
                timeZone: "Asia/Ho_Chi_Minh",
            },
            attendees: guests?.map((email) => ({ email })) || [],
            conferenceData: {
                createRequest: {
                    requestId: `meet-${Date.now()}`,
                    conferenceSolutionKey: {
                        type: "hangoutsMeet",
                    },
                },
            },
        };
        const response = await axios_1.default.post("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", event, {
            headers: {
                Authorization: `Bearer ${googleAccessToken}`,
                "Content-Type": "application/json",
            },
        });
        const conferenceData = response.data.conferenceData;
        if (conferenceData?.entryPoints?.[0]) {
            res.json({
                conferenceId: conferenceData.conferenceId,
                meetingUri: conferenceData.entryPoints[0].uri,
            });
        }
        else {
            res.status(500).json({ message: "Không thể tạo link Meet" });
        }
    }
    catch (error) {
        console.error("Failed to create Meet link:", error);
        res.status(500).json({
            message: "Không thể tạo link Google Meet",
            error: error.response?.data?.error?.message || error.message,
        });
    }
};
exports.createMeetLink = createMeetLink;
// Get current user's Google connection status
const getGoogleStatus = async (req, res) => {
    try {
        // ✅ FIX: Use req.user from middleware
        const user = req.user;
        if (!user) {
            res.status(401).json({ message: "Token không hợp lệ" });
            return;
        }
        res.json({
            connected: !!user.googleAccessToken,
            user: {
                userId: user.userId,
                email: user.email,
            },
        });
    }
    catch (error) {
        console.error("Failed to get Google status:", error);
        res.status(500).json({ message: "Lỗi kiểm tra trạng thái Google" });
    }
};
exports.getGoogleStatus = getGoogleStatus;
