import { AiConversationDoc } from "./ai-conversation.model";
import { AiMessageDoc } from "./ai-message.model";

export type PublicAiConversation = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicAiMessage = {
  id: string;
  role: string;
  content: string;
  tokens?: number;
  createdAt: Date;
};

export const toPublicConversation = (
  c: AiConversationDoc,
): PublicAiConversation => ({
  id: String(c._id),
  title: c.title,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export const toPublicMessage = (m: AiMessageDoc): PublicAiMessage => ({
  id: String(m._id),
  role: m.role,
  content: m.content,
  tokens: m.tokens,
  createdAt: m.createdAt,
});
