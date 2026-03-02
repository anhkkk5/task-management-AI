"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicMessage = exports.toPublicConversation = void 0;
const toPublicConversation = (c) => ({
    id: String(c._id),
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
});
exports.toPublicConversation = toPublicConversation;
const toPublicMessage = (m) => ({
    id: String(m._id),
    role: m.role,
    content: m.content,
    tokens: m.tokens,
    createdAt: m.createdAt,
});
exports.toPublicMessage = toPublicMessage;
