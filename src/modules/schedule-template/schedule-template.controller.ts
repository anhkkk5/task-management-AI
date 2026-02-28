import { Request, Response } from "express";
import { scheduleTemplateService } from "./schedule-template.service";

const getUserId = (req: Request): string | null => {
  const userId = (req as any).user?.userId;
  return userId ? String(userId) : null;
};

// Create template from AI schedule
export const createFromSchedule = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const body = (req as any).body ?? {};
    const name = String(body?.name ?? "").trim();
    const description = body?.description ? String(body.description) : undefined;
    const aiSchedule = body?.aiSchedule;
    const tags = body?.tags;

    if (!name) {
      res.status(400).json({ message: "Tên template không được để trống" });
      return;
    }

    if (!aiSchedule || !aiSchedule.schedule) {
      res.status(400).json({ message: "Lịch AI không hợp lệ" });
      return;
    }

    const template = await scheduleTemplateService.createFromSchedule(userId, {
      name,
      description,
      aiSchedule,
      tags,
    });

    res.status(201).json({ template });
  } catch (err) {
    console.error("createFromSchedule error:", err);
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "USER_ID_INVALID") {
      res.status(400).json({ message: "User ID không hợp lệ" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Create manual template
export const createTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const body = (req as any).body ?? {};
    const name = String(body?.name ?? "").trim();
    const description = body?.description ? String(body.description) : undefined;
    const pattern = body?.pattern;
    const tags = body?.tags;
    const isDefault = body?.isDefault === true;

    if (!name) {
      res.status(400).json({ message: "Tên template không được để trống" });
      return;
    }

    if (!pattern || !pattern.days) {
      res.status(400).json({ message: "Pattern không hợp lệ" });
      return;
    }

    const template = await scheduleTemplateService.create(userId, {
      name,
      description,
      pattern,
      tags,
      isDefault,
    });

    res.status(201).json({ template });
  } catch (err) {
    console.error("createTemplate error:", err);
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "USER_ID_INVALID") {
      res.status(400).json({ message: "User ID không hợp lệ" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Get template by ID
export const getTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const templateId = String((req as any).params?.id ?? "").trim();
    if (!templateId) {
      res.status(400).json({ message: "Template ID không hợp lệ" });
      return;
    }

    const template = await scheduleTemplateService.getById(userId, templateId);
    res.status(200).json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "ID_INVALID") {
      res.status(400).json({ message: "ID không hợp lệ" });
      return;
    }
    if (message === "TEMPLATE_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy template" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// List templates
export const listTemplates = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const tag = (req as any).query?.tag
      ? String((req as any).query.tag)
      : undefined;
    const limitRaw = (req as any).query?.limit;
    const limit =
      limitRaw !== undefined ? parseInt(String(limitRaw), 10) : undefined;

    const templates = await scheduleTemplateService.list(userId, {
      tag,
      limit,
    });

    res.status(200).json({ templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "USER_ID_INVALID") {
      res.status(400).json({ message: "User ID không hợp lệ" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Get default template
export const getDefaultTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const template = await scheduleTemplateService.getDefault(userId);
    if (!template) {
      res.status(404).json({ message: "Chưa có template mặc định" });
      return;
    }

    res.status(200).json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "USER_ID_INVALID") {
      res.status(400).json({ message: "User ID không hợp lệ" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Update template
export const updateTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const templateId = String((req as any).params?.id ?? "").trim();
    if (!templateId) {
      res.status(400).json({ message: "Template ID không hợp lệ" });
      return;
    }

    const body = (req as any).body ?? {};
    const update: any = {};

    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.description !== undefined)
      update.description = String(body.description);
    if (body.pattern !== undefined) update.pattern = body.pattern;
    if (body.tags !== undefined) update.tags = body.tags;
    if (body.isDefault !== undefined) update.isDefault = body.isDefault === true;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ message: "Không có dữ liệu cập nhật" });
      return;
    }

    const template = await scheduleTemplateService.update(
      userId,
      templateId,
      update,
    );
    res.status(200).json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "ID_INVALID") {
      res.status(400).json({ message: "ID không hợp lệ" });
      return;
    }
    if (message === "TEMPLATE_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy template" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Delete template
export const deleteTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const templateId = String((req as any).params?.id ?? "").trim();
    if (!templateId) {
      res.status(400).json({ message: "Template ID không hợp lệ" });
      return;
    }

    const result = await scheduleTemplateService.delete(userId, templateId);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "ID_INVALID") {
      res.status(400).json({ message: "ID không hợp lệ" });
      return;
    }
    if (message === "TEMPLATE_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy template" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Apply template
export const applyTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const templateId = String((req as any).params?.id ?? "").trim();
    if (!templateId) {
      res.status(400).json({ message: "Template ID không hợp lệ" });
      return;
    }

    const result = await scheduleTemplateService.apply(userId, templateId);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "ID_INVALID") {
      res.status(400).json({ message: "ID không hợp lệ" });
      return;
    }
    if (message === "TEMPLATE_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy template" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Set as default
export const setDefaultTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const templateId = String((req as any).params?.id ?? "").trim();
    if (!templateId) {
      res.status(400).json({ message: "Template ID không hợp lệ" });
      return;
    }

    const result = await scheduleTemplateService.setDefault(userId, templateId);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "ID_INVALID") {
      res.status(400).json({ message: "ID không hợp lệ" });
      return;
    }
    if (message === "TEMPLATE_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy template" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
