// Google Auth Controller
import { Request, Response } from "express";
import axios from "axios";
import { verifyJWT, JWTPayload } from "../../utils/jwt";

// Types for Google API responses
interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface GoogleContact {
  email: string;
  name?: string;
  photoUrl?: string;
}

interface GoogleMeetLink {
  conferenceId: string;
  meetingUri: string;
}

// Get Google user info using stored access token
export const getGoogleUserInfo = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Thiếu token" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const payload = verifyJWT(token);

    if (!payload?.googleAccessToken) {
      res.status(401).json({ message: "Chưa đăng nhập Google" });
      return;
    }

    const response = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${payload.googleAccessToken}`,
        },
      },
    );

    res.json(response.data);
  } catch (error: any) {
    console.error("Failed to get Google user info:", error);
    res.status(500).json({
      message: "Không thể lấy thông tin Google",
      error: error.message,
    });
  }
};

// Search contacts by email (People API proxy)
export const searchContacts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { query } = req.query;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Thiếu token" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const payload = verifyJWT(token);

    if (!payload?.googleAccessToken) {
      res.status(401).json({ message: "Chưa đăng nhập Google" });
      return;
    }

    // Search in user's contacts
    const response = await axios.get(
      `https://people.googleapis.com/v1/people:searchContacts`,
      {
        params: {
          query: query as string,
          pageSize: 10,
        },
        headers: {
          Authorization: `Bearer ${payload.googleAccessToken}`,
        },
      },
    );

    const contacts: GoogleContact[] =
      response.data.results?.map((result: any) => {
        const person = result.person;
        return {
          email: person.emailAddresses?.[0]?.value || "",
          name: person.names?.[0]?.displayName || "",
          photoUrl: person.photos?.[0]?.url,
        };
      }) || [];

    res.json(contacts);
  } catch (error: any) {
    console.error("Failed to search contacts:", error);
    // Return empty array instead of error for better UX
    res.json([]);
  }
};

// Get contact by email
export const getContactByEmail = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { email } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Thiếu token" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const payload = verifyJWT(token);

    if (!payload?.googleAccessToken) {
      res.status(401).json({ message: "Chưa đăng nhập Google" });
      return;
    }

    // Try to search for contact
    try {
      const response = await axios.get(
        `https://people.googleapis.com/v1/people:searchContacts`,
        {
          params: {
            query: email,
            pageSize: 10,
          },
          headers: {
            Authorization: `Bearer ${payload.googleAccessToken}`,
          },
        },
      );

      const match = response.data.results?.find((result: any) => {
        const personEmail = result.person?.emailAddresses?.[0]?.value;
        return (
          (personEmail as string)?.toLowerCase() ===
          (email as string).toLowerCase()
        );
      });

      if (match) {
        const person = match.person;
        res.json({
          email,
          name:
            person.names?.[0]?.displayName || (email as string).split("@")[0],
          photoUrl: person.photos?.[0]?.url,
        });
        return;
      }
    } catch {
      // Ignore search error
    }

    // Return basic info if not found
    res.json({
      email,
      name: (email as string).split("@")[0],
    });
  } catch (error: any) {
    console.error("Failed to get contact:", error);
    res.status(500).json({
      message: "Không thể lấy thông tin liên hệ",
      error: error.message,
    });
  }
};

// Create Google Calendar event with Meet link
export const createMeetLink = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { title, description, startTime, endTime, guests } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Thiếu token" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const payload = verifyJWT(token);

    if (!payload?.googleAccessToken) {
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
      attendees: guests?.map((email: string) => ({ email })) || [],
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
    };

    const response = await axios.post(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
      event,
      {
        headers: {
          Authorization: `Bearer ${payload.googleAccessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const conferenceData = response.data.conferenceData;
    if (conferenceData?.entryPoints?.[0]) {
      res.json({
        conferenceId: conferenceData.conferenceId,
        meetingUri: conferenceData.entryPoints[0].uri,
      });
    } else {
      res.status(500).json({ message: "Không thể tạo link Meet" });
    }
  } catch (error: any) {
    console.error("Failed to create Meet link:", error);
    res.status(500).json({
      message: "Không thể tạo link Google Meet",
      error: error.response?.data?.error?.message || error.message,
    });
  }
};

// Get current user's Google connection status
export const getGoogleStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Thiếu token" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const payload = verifyJWT(token);

    if (!payload) {
      res.status(401).json({ message: "Token không hợp lệ" });
      return;
    }

    res.json({
      connected: !!payload.googleAccessToken,
      user: {
        userId: payload.userId,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      },
    });
  } catch (error: any) {
    console.error("Failed to get Google status:", error);
    res.status(500).json({ message: "Lỗi kiểm tra trạng thái Google" });
  }
};
