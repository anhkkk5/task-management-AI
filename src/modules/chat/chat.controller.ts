import { Request, Response } from "express";
import { chatService } from "./chat.service";
import { presenceService } from "./presence.service";
import { uploadImageBuffer } from "../../services/cloudinary.service";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { User } from "../auth/auth.model";

const handleError = (res: Response, err: any, fallback = "Đã xảy ra lỗi") => {
  const status = err?.status || 500;
  res.status(status).json({ message: err?.message || fallback });
};

const uploadRawBuffer = (
  buffer: Buffer,
  opts: { folder: string; resourceType: "image" | "video" | "raw" },
): Promise<{
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  duration?: number;
  bytes?: number;
  format?: string;
}> => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return Promise.reject(new Error("Missing env CLOUDINARY"));
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: opts.folder, resource_type: opts.resourceType },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("UPLOAD_FAILED"));
          return;
        }
        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
          width: (result as any).width,
          height: (result as any).height,
          duration: (result as any).duration,
          bytes: (result as any).bytes,
          format: (result as any).format,
        });
      },
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

export const chatController = {
  createDirectConversation: async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { userId: otherUserId } = req.body || {};
      if (!otherUserId) {
        res.status(400).json({ message: "userId là bắt buộc" });
        return;
      }
      const conversation = await chatService.createDirectConversation(
        userId,
        String(otherUserId),
      );
      res.status(200).json({ conversation });
    } catch (err) {
      handleError(res, err, "Không thể tạo cuộc trò chuyện");
    }
  },

  getOrCreateTeamConversation: async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { teamId } = req.body || {};
      if (!teamId) {
        res.status(400).json({ message: "teamId là bắt buộc" });
        return;
      }
      const conversation = await chatService.getOrCreateTeamConversation(
        String(teamId),
        userId,
      );
      res.status(200).json({ conversation });
    } catch (err) {
      handleError(res, err, "Không thể tạo cuộc trò chuyện nhóm");
    }
  },

  listConversations: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const limit = parseInt(req.query.limit as string) || 30;
      const offset = parseInt(req.query.offset as string) || 0;
      const search = (req.query.search as string) || undefined;
      const conversations = await chatService.listUserConversations(userId, {
        limit,
        offset,
        search,
      });
      res.status(200).json({ conversations });
    } catch (err) {
      handleError(res, err, "Không thể tải danh sách cuộc trò chuyện");
    }
  },

  getConversation: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { conversationId } = req.params;
      const conversation = await chatService.getConversation(
        String(conversationId),
        userId,
      );
      res.status(200).json({ conversation });
    } catch (err) {
      handleError(res, err, "Không thể tải cuộc trò chuyện");
    }
  },

  sendMessage: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { conversationId } = req.params;
      const { content, type, attachments, replyTo } = req.body || {};
      const message = await chatService.sendMessage(
        String(conversationId),
        userId,
        { content, type, attachments, replyTo },
      );
      res.status(201).json({ message });
    } catch (err) {
      handleError(res, err, "Không thể gửi tin nhắn");
    }
  },

  listMessages: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 30;
      const before = (req.query.before as string) || undefined;
      const after = (req.query.after as string) || undefined;
      const messages = await chatService.listMessages(
        String(conversationId),
        userId,
        { limit, before, after },
      );
      res.status(200).json({ messages });
    } catch (err) {
      handleError(res, err, "Không thể tải tin nhắn");
    }
  },

  markAllAsSeen: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { conversationId } = req.params;
      await chatService.markAllAsSeen(String(conversationId), userId);
      res.status(200).json({ message: "OK" });
    } catch (err) {
      handleError(res, err, "Không thể đánh dấu đã xem");
    }
  },

  reactMessage: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { messageId } = req.params;
      const { emoji, action } = req.body || {};
      if (!emoji || !["add", "remove"].includes(action)) {
        res
          .status(400)
          .json({ message: "emoji và action (add/remove) là bắt buộc" });
        return;
      }
      const message = await chatService.toggleReaction(
        String(messageId),
        userId,
        String(emoji),
        action,
      );
      res.status(200).json({ message });
    } catch (err) {
      handleError(res, err, "Không thể react");
    }
  },

  editMessage: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { messageId } = req.params;
      const { content } = req.body || {};
      if (typeof content !== "string") {
        res.status(400).json({ message: "content là bắt buộc" });
        return;
      }
      const message = await chatService.editMessage(
        String(messageId),
        userId,
        content,
      );
      res.status(200).json({ message });
    } catch (err) {
      handleError(res, err, "Không thể sửa tin nhắn");
    }
  },

  deleteMessage: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { messageId } = req.params;
      const message = await chatService.deleteMessage(
        String(messageId),
        userId,
      );
      res.status(200).json({ message });
    } catch (err) {
      handleError(res, err, "Không thể xóa tin nhắn");
    }
  },

  uploadAttachment: async (req: Request, res: Response): Promise<void> => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({ message: "Chưa có file đính kèm" });
        return;
      }
      const mime = file.mimetype || "";
      let kind: "image" | "video" | "file" = "file";
      let resourceType: "image" | "video" | "raw" = "raw";
      if (mime.startsWith("image/")) {
        kind = "image";
        resourceType = "image";
      } else if (mime.startsWith("video/")) {
        kind = "video";
        resourceType = "video";
      }

      let uploaded;
      if (kind === "image") {
        const r = await uploadImageBuffer(file.buffer, { folder: "chat" });
        uploaded = { url: r.url, publicId: r.publicId } as any;
      } else {
        uploaded = await uploadRawBuffer(file.buffer, {
          folder: "chat",
          resourceType,
        });
      }

      const attachment = {
        kind,
        url: uploaded.url,
        publicId: uploaded.publicId,
        name: file.originalname,
        mimeType: mime,
        size: file.size,
        width: uploaded.width,
        height: uploaded.height,
        duration: uploaded.duration,
      };
      res.status(200).json({ attachment });
    } catch (err) {
      handleError(res, err, "Không thể tải tệp lên");
    }
  },

  searchUsers: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const q = String(req.query.q || "").trim();
      if (!q || q.length < 1) {
        res.status(200).json({ users: [] });
        return;
      }
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const users = await User.find({
        _id: { $ne: userId },
        $or: [{ name: regex }, { email: regex }],
      })
        .select("_id name email avatar")
        .limit(20)
        .lean();
      res.status(200).json({
        users: users.map((u: any) => ({
          id: String(u._id),
          name: u.name,
          email: u.email,
          avatar: u.avatar,
        })),
      });
    } catch (err) {
      handleError(res, err, "Không thể tìm người dùng");
    }
  },

  getOnlineUsers: async (_req: Request, res: Response): Promise<void> => {
    try {
      const onlineUsers = await presenceService.getOnlineUsers();
      res.status(200).json({ onlineUsers });
    } catch (err) {
      handleError(res, err, "Không thể lấy trạng thái online");
    }
  },

  getTypingUsers: async (req: Request, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const typingUsers = await presenceService.getTypingUsers(
        String(conversationId),
      );
      res.status(200).json({ conversationId, typingUsers });
    } catch (err) {
      handleError(res, err, "Không thể lấy trạng thái đang gõ");
    }
  },
};
