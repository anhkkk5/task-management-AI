"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiChatService = void 0;
const mongoose_1 = require("mongoose");
const ai_provider_1 = require("./ai.provider");
const ai_repository_1 = require("./ai.repository");
const ai_mapper_1 = require("./ai.mapper");
const ai_intent_1 = require("./ai-intent");
exports.aiChatService = {
    chat: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const title = input.message.slice(0, 60);
        if (input.conversationId && !mongoose_1.Types.ObjectId.isValid(input.conversationId)) {
            throw new Error("CONVERSATION_ID_INVALID");
        }
        const conversationObjectId = input.conversationId
            ? new mongoose_1.Types.ObjectId(input.conversationId)
            : (await ai_repository_1.aiRepository.createConversation({
                userId: userObjectId,
                title,
            }))._id;
        if (input.conversationId) {
            const existing = await ai_repository_1.aiRepository.findConversationByIdForUser({
                conversationId: conversationObjectId,
                userId: userObjectId,
            });
            if (!existing) {
                throw new Error("CONVERSATION_FORBIDDEN");
            }
        }
        // Load conversation history để AI có context
        const historyMessages = await ai_repository_1.aiRepository.listMessagesByConversation({
            conversationId: conversationObjectId,
            userId: userObjectId,
            limit: 20, // Lấy 20 tin nhắn gần nhất
        });
        // Save user message
        await ai_repository_1.aiRepository.createMessage({
            conversationId: conversationObjectId,
            userId: userObjectId,
            role: "user",
            content: input.message,
        });
        // Build messages array với history
        // Intent detection + 2-layer language system
        const intent = (0, ai_intent_1.detectIntent)(input.message);
        const userLang = (0, ai_intent_1.detectUserLanguage)(input.message);
        const targetLang = (0, ai_intent_1.resolveTargetLanguage)(input.subtaskContext);
        const systemContent = (0, ai_intent_1.buildSystemPrompt)({
            userLang,
            targetLang,
            intent,
            subtaskContext: input.subtaskContext,
            customSystemPrompt: input.systemPrompt,
        });
        const historyForAI = historyMessages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
        }));
        // Few-shot examples (chỉ dùng khi chưa có history)
        const fewShot = historyMessages.length === 0 && input.fewShotMessages?.length
            ? input.fewShotMessages.map((m) => ({
                role: m.role,
                content: m.content,
            }))
            : [];
        const result = await ai_provider_1.aiProvider.chat({
            messages: [
                { role: "system", content: systemContent },
                ...fewShot,
                ...historyForAI,
                { role: "user", content: input.message },
            ],
            model: input.model,
            temperature: intent === "EXERCISE" || intent === "CHECK_ANSWER" ? 0.2 : 0.4,
            maxTokens: input.maxTokens,
        });
        await ai_repository_1.aiRepository.createMessage({
            conversationId: conversationObjectId,
            userId: userObjectId,
            role: "assistant",
            content: result.content,
            tokens: result.usage?.totalTokens,
        });
        await ai_repository_1.aiRepository.touchConversationUpdatedAt({
            conversationId: conversationObjectId,
            userId: userObjectId,
        });
        return {
            reply: result.content,
            conversationId: String(conversationObjectId),
            model: result.model,
            usage: result.usage,
        };
    },
    chatStream: async function* (userId, input) {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const title = input.message.slice(0, 60);
        if (input.conversationId && !mongoose_1.Types.ObjectId.isValid(input.conversationId)) {
            throw new Error("CONVERSATION_ID_INVALID");
        }
        const conversationObjectId = input.conversationId
            ? new mongoose_1.Types.ObjectId(input.conversationId)
            : (await ai_repository_1.aiRepository.createConversation({
                userId: userObjectId,
                title,
            }))._id;
        if (input.conversationId) {
            const existing = await ai_repository_1.aiRepository.findConversationByIdForUser({
                conversationId: conversationObjectId,
                userId: userObjectId,
            });
            if (!existing) {
                throw new Error("CONVERSATION_FORBIDDEN");
            }
        }
        await ai_repository_1.aiRepository.createMessage({
            conversationId: conversationObjectId,
            userId: userObjectId,
            role: "user",
            content: input.message,
        });
        yield { type: "meta", conversationId: String(conversationObjectId) };
        const stream = ai_provider_1.aiProvider.chatStream({
            messages: [
                {
                    role: "system",
                    content: "You are a productivity assistant. Reply in Vietnamese.",
                },
                {
                    role: "user",
                    content: input.message,
                },
            ],
            model: input.model,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
        });
        let assistantText = "";
        let finalModel;
        let finalUsage;
        for await (const ev of stream) {
            if (ev.type === "meta") {
                yield ev;
                continue;
            }
            if (ev.type === "delta") {
                assistantText += ev.delta;
                yield ev;
                continue;
            }
            finalModel = ev.model;
            finalUsage = ev.usage;
            yield ev;
        }
        if (assistantText) {
            await ai_repository_1.aiRepository.createMessage({
                conversationId: conversationObjectId,
                userId: userObjectId,
                role: "assistant",
                content: assistantText,
                tokens: finalUsage?.totalTokens,
            });
        }
        await ai_repository_1.aiRepository.touchConversationUpdatedAt({
            conversationId: conversationObjectId,
            userId: userObjectId,
        });
    },
    listConversations: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
        const items = await ai_repository_1.aiRepository.listConversationsByUser({
            userId: userObjectId,
            limit,
        });
        return { conversations: items.map(ai_mapper_1.toPublicConversation) };
    },
    getConversationById: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        if (!mongoose_1.Types.ObjectId.isValid(input.id)) {
            throw new Error("CONVERSATION_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const conversationObjectId = new mongoose_1.Types.ObjectId(input.id);
        const conversation = await ai_repository_1.aiRepository.findConversationByIdForUser({
            conversationId: conversationObjectId,
            userId: userObjectId,
        });
        if (!conversation) {
            throw new Error("CONVERSATION_FORBIDDEN");
        }
        const limit = Math.min(Math.max(input.limitMessages ?? 100, 1), 500);
        const messages = await ai_repository_1.aiRepository.listMessagesByConversation({
            conversationId: conversationObjectId,
            userId: userObjectId,
            limit,
        });
        return {
            conversation: (0, ai_mapper_1.toPublicConversation)(conversation),
            messages: messages.map(ai_mapper_1.toPublicMessage),
        };
    },
};
