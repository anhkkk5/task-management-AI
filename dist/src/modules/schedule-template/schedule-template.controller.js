"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDefaultTemplate = exports.applyTemplate = exports.deleteTemplate = exports.updateTemplate = exports.getDefaultTemplate = exports.listTemplates = exports.getTemplate = exports.createTemplate = exports.createFromSchedule = void 0;
const schedule_template_service_1 = require("./schedule-template.service");
const getUserId = (req) => {
    const userId = req.user?.userId;
    return userId ? String(userId) : null;
};
// Create template from AI schedule
const createFromSchedule = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const body = req.body ?? {};
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
        const template = await schedule_template_service_1.scheduleTemplateService.createFromSchedule(userId, {
            name,
            description,
            aiSchedule,
            tags,
        });
        res.status(201).json({ template });
    }
    catch (err) {
        console.error("createFromSchedule error:", err);
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.createFromSchedule = createFromSchedule;
// Create manual template
const createTemplate = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const body = req.body ?? {};
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
        const template = await schedule_template_service_1.scheduleTemplateService.create(userId, {
            name,
            description,
            pattern,
            tags,
            isDefault,
        });
        res.status(201).json({ template });
    }
    catch (err) {
        console.error("createTemplate error:", err);
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.createTemplate = createTemplate;
// Get template by ID
const getTemplate = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const templateId = String(req.params?.id ?? "").trim();
        if (!templateId) {
            res.status(400).json({ message: "Template ID không hợp lệ" });
            return;
        }
        const template = await schedule_template_service_1.scheduleTemplateService.getById(userId, templateId);
        res.status(200).json({ template });
    }
    catch (err) {
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
exports.getTemplate = getTemplate;
// List templates
const listTemplates = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const tag = req.query?.tag
            ? String(req.query.tag)
            : undefined;
        const limitRaw = req.query?.limit;
        const limit = limitRaw !== undefined ? parseInt(String(limitRaw), 10) : undefined;
        const templates = await schedule_template_service_1.scheduleTemplateService.list(userId, {
            tag,
            limit,
        });
        res.status(200).json({ templates });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.listTemplates = listTemplates;
// Get default template
const getDefaultTemplate = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const template = await schedule_template_service_1.scheduleTemplateService.getDefault(userId);
        if (!template) {
            res.status(404).json({ message: "Chưa có template mặc định" });
            return;
        }
        res.status(200).json({ template });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.getDefaultTemplate = getDefaultTemplate;
// Update template
const updateTemplate = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const templateId = String(req.params?.id ?? "").trim();
        if (!templateId) {
            res.status(400).json({ message: "Template ID không hợp lệ" });
            return;
        }
        const body = req.body ?? {};
        const update = {};
        if (body.name !== undefined)
            update.name = String(body.name).trim();
        if (body.description !== undefined)
            update.description = String(body.description);
        if (body.pattern !== undefined)
            update.pattern = body.pattern;
        if (body.tags !== undefined)
            update.tags = body.tags;
        if (body.isDefault !== undefined)
            update.isDefault = body.isDefault === true;
        if (Object.keys(update).length === 0) {
            res.status(400).json({ message: "Không có dữ liệu cập nhật" });
            return;
        }
        const template = await schedule_template_service_1.scheduleTemplateService.update(userId, templateId, update);
        res.status(200).json({ template });
    }
    catch (err) {
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
exports.updateTemplate = updateTemplate;
// Delete template
const deleteTemplate = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const templateId = String(req.params?.id ?? "").trim();
        if (!templateId) {
            res.status(400).json({ message: "Template ID không hợp lệ" });
            return;
        }
        const result = await schedule_template_service_1.scheduleTemplateService.delete(userId, templateId);
        res.status(200).json(result);
    }
    catch (err) {
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
exports.deleteTemplate = deleteTemplate;
// Apply template
const applyTemplate = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const templateId = String(req.params?.id ?? "").trim();
        if (!templateId) {
            res.status(400).json({ message: "Template ID không hợp lệ" });
            return;
        }
        const result = await schedule_template_service_1.scheduleTemplateService.apply(userId, templateId);
        res.status(200).json(result);
    }
    catch (err) {
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
exports.applyTemplate = applyTemplate;
// Set as default
const setDefaultTemplate = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const templateId = String(req.params?.id ?? "").trim();
        if (!templateId) {
            res.status(400).json({ message: "Template ID không hợp lệ" });
            return;
        }
        const result = await schedule_template_service_1.scheduleTemplateService.setDefault(userId, templateId);
        res.status(200).json(result);
    }
    catch (err) {
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
exports.setDefaultTemplate = setDefaultTemplate;
