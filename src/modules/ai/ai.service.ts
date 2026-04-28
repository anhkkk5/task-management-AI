import { Types } from "mongoose";
import { aiProvider } from "./ai.provider";
import { aiRepository } from "./ai.repository";
import {
  PublicAiConversation,
  PublicAiMessage,
  toPublicConversation,
  toPublicMessage,
} from "./ai.mapper";
import { aiCacheService } from "./ai.cache.service";
import { extractJson, repairTruncatedJson } from "./ai-utils";

export { aiChatService } from "./ai-chat.service";
export { aiRescheduleService } from "./ai-reschedule.service";

export const aiService = {
  chat: async (
    ...args: Parameters<typeof import("./ai-chat.service").aiChatService.chat>
  ) => {
    const { aiChatService } = await import("./ai-chat.service");
    return aiChatService.chat(...args);
  },

  chatStream: async function* (
    ...args: Parameters<
      typeof import("./ai-chat.service").aiChatService.chatStream
    >
  ) {
    const { aiChatService } = await import("./ai-chat.service");
    yield* aiChatService.chatStream(...args);
  },

  listConversations: async (
    ...args: Parameters<
      typeof import("./ai-chat.service").aiChatService.listConversations
    >
  ) => {
    const { aiChatService } = await import("./ai-chat.service");
    return aiChatService.listConversations(...args);
  },

  getConversationById: async (
    ...args: Parameters<
      typeof import("./ai-chat.service").aiChatService.getConversationById
    >
  ) => {
    const { aiChatService } = await import("./ai-chat.service");
    return aiChatService.getConversationById(...args);
  },

  schedulePlan: async (
    ...args: Parameters<
      typeof import("../scheduler/hybrid-schedule.service").hybridScheduleService.schedulePlan
    >
  ) => {
    const { hybridScheduleService } =
      await import("../scheduler/hybrid-schedule.service");
    return hybridScheduleService.schedulePlan(...args);
  },

  smartReschedule: async (
    ...args: Parameters<
      typeof import("./ai-reschedule.service").aiRescheduleService.smartReschedule
    >
  ) => {
    const { aiRescheduleService } = await import("./ai-reschedule.service");
    return aiRescheduleService.smartReschedule(...args);
  },

  taskBreakdown: async (
    userId: string,
    input: {
      title: string;
      deadline?: Date;
      description?: string;
      totalMinutes?: number;
      profile?: {
        industryCode?: string;
        industryLabel?: string;
        positionCode?: string;
        positionLabel?: string;
        levelCode?: string;
        levelLabel?: string;
      };
      slots?: {
        date: string;
        day: string;
        time: string;
        durationMinutes?: number;
      }[];
    },
  ): Promise<{
    steps: {
      title: string;
      status: string;
      estimatedDuration?: number;
      difficulty?: "easy" | "medium" | "hard";
      description?: string;
    }[];
    totalEstimatedDuration?: number;
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    const breakdownPromptVersion = "task-breakdown-v6-desc-relevance";

    const profileKey = input.profile
      ? [
          input.profile.industryCode ?? "",
          input.profile.positionCode ?? "",
          input.profile.levelCode ?? "",
        ].join("|")
      : "";

    const cached = await aiCacheService.getTaskBreakdown({
      userId,
      title: input.title,
      deadline: input.deadline,
      description: input.description,
      totalMinutes: input.totalMinutes,
      profileKey,
      model: breakdownPromptVersion,
    });
    if (cached) {
      const cachedTotal =
        cached.steps?.reduce(
          (s: number, x: any) => s + (x.estimatedDuration ?? 0),
          0,
        ) ?? 0;
      if (
        !input.totalMinutes ||
        Math.abs(cachedTotal - input.totalMinutes) < 5
      ) {
        return cached;
      }
    }

    const deadlineText = input.deadline
      ? `Hạn chót: ${input.deadline.toISOString()}`
      : "";

    const descriptionRaw = String(input.description ?? "").trim();

    const profileLines: string[] = [];
    if (input.profile?.industryLabel)
      profileLines.push(`Ngành: ${input.profile.industryLabel}`);
    if (input.profile?.positionLabel)
      profileLines.push(`Vị trí: ${input.profile.positionLabel}`);
    if (input.profile?.levelLabel)
      profileLines.push(`Level: ${input.profile.levelLabel}`);

    const levelCode = input.profile?.levelCode;
    const isBeginner =
      levelCode === "intern" ||
      levelCode === "fresher" ||
      levelCode === "student";
    const isProfessional =
      levelCode === "junior" ||
      levelCode === "middle" ||
      levelCode === "senior" ||
      levelCode === "lead" ||
      levelCode === "manager" ||
      levelCode === "pm";

    const totalHint =
      input.totalMinutes && input.totalMinutes > 0
        ? `Tổng thời gian mục tiêu cho task: ${input.totalMinutes} phút. Tổng estimatedDuration của tất cả bước PHẢI bằng đúng ${input.totalMinutes} phút (±5).`
        : "";

    const taskText = `${input.title}\n${input.description ?? ""}`.toLowerCase();
    const profileDomainText =
      `${input.profile?.positionCode ?? ""} ${input.profile?.positionLabel ?? ""}`.toLowerCase();
    const frontendHints = [
      "frontend",
      "front-end",
      "ui",
      "ux",
      "giao diện",
      "màn hình",
      "form",
      "react",
      "vue",
      "angular",
      "css",
      "tailwind",
      "figma",
      "responsive",
    ];
    const backendHints = [
      "backend",
      "back-end",
      "api",
      "endpoint",
      "schema",
      "database",
      "jwt",
      "oauth",
      "redis",
      "queue",
      "middleware",
      "microservice",
    ];
    const hasFrontendHint = frontendHints.some((k) => taskText.includes(k));
    const hasBackendHint = backendHints.some((k) => taskText.includes(k));
    const titleIndicatesUiOnly = [
      "ui",
      "giao diện",
      "man hinh",
      "màn hình",
      "form",
      "login/register ui",
    ].some((k) =>
      String(input.title || "")
        .toLowerCase()
        .includes(k),
    );
    const roleIsFrontend = ["frontend", "front-end", "ui", "ux", "react"].some(
      (k) => profileDomainText.includes(k),
    );
    const roleIsBackend = ["backend", "back-end", "api", "server"].some((k) =>
      profileDomainText.includes(k),
    );
    const roleIsFullstack = ["fullstack", "full-stack"].some((k) =>
      profileDomainText.includes(k),
    );

    const domainMode:
      | "frontend_strict"
      | "backend_strict"
      | "frontend_prefer"
      | "backend_prefer"
      | "fullstack"
      | "neutral" = titleIndicatesUiOnly
      ? "frontend_strict"
      : hasFrontendHint && !hasBackendHint
        ? "frontend_strict"
        : hasBackendHint && !hasFrontendHint
          ? "backend_strict"
          : roleIsFrontend && !roleIsFullstack
            ? "frontend_prefer"
            : roleIsBackend && !roleIsFullstack
              ? "backend_prefer"
              : roleIsFullstack
                ? "fullstack"
                : "neutral";

    const domainGuidanceByMode: Record<typeof domainMode, string> = {
      frontend_strict: `\nDOMAIN BẮT BUỘC: FRONTEND/UI.
- Chỉ tạo các bước liên quan giao diện người dùng: UI flow, component, state, validation form, responsive, accessibility, API integration ở mức tiêu thụ.
- KHÔNG tạo các bước backend như DB schema, implement endpoint, JWT service, migration, queue, lockout policy.`,
      backend_strict: `\nDOMAIN BẮT BUỘC: BACKEND/API.
- Chỉ tạo các bước backend: schema/API/service/validation/test backend.
- KHÔNG tạo các bước thiên về UI pixel/layout/animation.`,
      frontend_prefer: `\nDOMAIN ƯU TIÊN: FRONTEND/UI theo vai trò hiện tại.
- Nếu task mơ hồ, mặc định chọn bước frontend trước.
- Tránh sinh bước backend trừ khi title/description yêu cầu rõ ràng.`,
      backend_prefer: `\nDOMAIN ƯU TIÊN: BACKEND/API theo vai trò hiện tại.
- Nếu task mơ hồ, mặc định chọn bước backend trước.
- Tránh sinh bước UI trừ khi title/description yêu cầu rõ ràng.`,
      fullstack: `\nDOMAIN: FULLSTACK.
- Chỉ tạo bước FE+BE khi task yêu cầu cả hai.
- Nếu title nhấn mạnh UI thì nghiêng về FE; nếu nhấn mạnh API/schema thì nghiêng về BE.`,
      neutral: "",
    };
    const domainGuidance = domainGuidanceByMode[domainMode];

    const isFeatureLevelTask = true;
    const explicitlyRequestsAdvancedOps = [
      "deploy",
      "production",
      "prod",
      "2fa",
      "totp",
      "audit log",
      "lockout",
      "sso",
      "kubernetes",
      "terraform",
    ].some((k) => taskText.includes(k));
    const scopeGuidance = isFeatureLevelTask
      ? `\nRÀNG BUỘC PHẠM VI (SCOPE CONTROL):
- Xem đây là implementation cho MỘT feature, không phải rollout toàn hệ thống.
- Chỉ bao gồm các bước trực tiếp cần để hoàn thành task đã nêu.
- Không mở rộng sang hạng mục enterprise/production hardening nếu task không yêu cầu rõ.`
      : "";
    const negativeGuidance = !explicitlyRequestsAdvancedOps
      ? `\nNEGATIVE CONSTRAINT (BẮT BUỘC):
- KHÔNG thêm các hạng mục ngoài phạm vi như deploy production, 2FA/TOTP, audit log, lockout policy, DevOps setup.
- KHÔNG thêm bước backend nếu task là frontend thuần; KHÔNG thêm bước frontend nếu task là backend thuần.`
      : "";

    const levelGuidance = isProfessional
      ? `\nNgười thực hiện là ${input.profile?.levelLabel} (${input.profile?.positionLabel ?? "chuyên môn"}), đang làm việc trong thời đại có AI hỗ trợ viết code (Cursor, Copilot, v.v.).
QUY TẮC BẮT BUỘC:
- CẤM tạo các bước kiểu "Tìm hiểu X", "Học về Y", "Nghiên cứu khái niệm Z" cho khái niệm cơ bản mà level này PHẢI biết rồi (VD: với Senior Backend thì JWT, OAuth, bcrypt, session, middleware, REST, DB index... là kiến thức nền, KHÔNG được tạo bước học lại).
- Breakdown phải là MỘT QUY TRÌNH TRIỂN KHAI feature-level thực tế end-to-end, chỉ gồm các giai đoạn cần thiết cho task hiện tại.
- Tên mỗi bước phải ở dạng hành động cụ thể và bám đúng phạm vi task (tránh ví dụ ngoài phạm vi).
- Mỗi bước nên có description nói RÕ input/output hoặc acceptance criteria (VD: "Trả về access token 15 phút + refresh token 7 ngày, lưu hash refresh trong DB").
- Thời lượng tính theo tốc độ làm thực tế của level này CÓ AI hỗ trợ (Cursor/Copilot/ChatGPT/Gemini/Claude): phần lớn bước coding/soạn thảo/phân tích chỉ 15-45 phút, bước thiết kế/review 20-60 phút, rất hiếm khi > 90 phút cho 1 bước.
- KHÔNG ước lượng theo thời gian thời đại chưa có AI. AI đã rút ngắn hầu hết công việc trên máy tính (viết code, viết test, soạn tài liệu, phân tích, tối ưu, dịch, tóm tắt) khoảng 40-60%.
- Tổng thời lượng cho 1 task feature-level thông thường chỉ nên rơi vào 2-5 giờ, trừ khi task thực sự lớn.`
      : isBeginner
        ? `\nNgười thực hiện là ${input.profile?.levelLabel ?? "người mới"}. Có thể thêm 1-2 bước tìm hiểu nền tảng nếu thực sự cần, nhưng phần chính vẫn phải là các bước triển khai cụ thể.`
        : "";

    const tokenize = (text: string): string[] =>
      text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((x) => x.trim())
        .filter(Boolean);

    const stopWords = new Set([
      "va",
      "voi",
      "cho",
      "cua",
      "tren",
      "duoi",
      "mot",
      "nhung",
      "cac",
      "the",
      "is",
      "are",
      "for",
      "with",
      "this",
      "that",
      "from",
      "into",
      "task",
      "viec",
      "lam",
      "va",
    ]);

    const titleTokens = new Set(
      tokenize(input.title).filter((t) => t.length >= 3 && !stopWords.has(t)),
    );
    const descTokensList = tokenize(descriptionRaw).filter(
      (t) => t.length >= 3 && !stopWords.has(t),
    );
    const descTokens = new Set(descTokensList);
    const descWordCount = descriptionRaw
      ? descriptionRaw.split(/\s+/).filter(Boolean).length
      : 0;

    let sharedTokenCount = 0;
    for (const t of descTokens) if (titleTokens.has(t)) sharedTokenCount += 1;

    const descHasFrontendHint = frontendHints.some((k) =>
      descriptionRaw.toLowerCase().includes(k),
    );
    const descHasBackendHint = backendHints.some((k) =>
      descriptionRaw.toLowerCase().includes(k),
    );
    const domainMatchesTitle =
      (hasFrontendHint && descHasFrontendHint) ||
      (hasBackendHint && descHasBackendHint);

    const specHintRegex =
      /(acceptance|tiêu chí|input|output|payload|endpoint|schema|field|trường|response|status|validate|kpi|deliverable|yêu cầu|ràng buộc|api|jwt|token|oauth|refresh|login|register)/i;
    const descHasSpecHints = specHintRegex.test(descriptionRaw);

    const descriptionRelevant =
      descWordCount >= 4 &&
      (sharedTokenCount >= 1 || domainMatchesTitle || descHasSpecHints);

    if (descriptionRaw && !descriptionRelevant) {
      console.log(
        `[aiBreakdown] Description bị bỏ qua vì không liên quan title "${input.title}" (words=${descWordCount}, shared=${sharedTokenCount})`,
      );
    }

    const descriptionText = descriptionRelevant
      ? `Mô tả (SPEC ĐÁNG TIN của task, BẮT BUỘC bám theo): ${descriptionRaw}`
      : "";

    const anchorKeywords = Array.from(
      new Set(
        descriptionRelevant
          ? [...titleTokens, ...descTokensList]
          : Array.from(titleTokens),
      ),
    ).slice(0, descriptionRelevant ? 20 : 12);
    const anchorSet = new Set(anchorKeywords);
    const groundingGuidance =
      anchorKeywords.length > 0
        ? `\nRÀNG BUỘC BÁM SÁT NGỮ CẢNH:
- Tự xác định domain chính từ title${descriptionRelevant ? "/description" : ""} rồi bám chặt domain đó.
- Mỗi bước phải đóng góp trực tiếp vào output của task, dùng ngôn ngữ bám theo các từ khóa sau: ${anchorKeywords.join(", ")}.
- Không tự mở rộng sang domain khác nếu không có tín hiệu rõ trong task.`
        : "";

    // Ép AI trích xuất MỌI yêu cầu/criteria từ mô tả khi mô tả liên quan.
    const descriptionSpecGuidance = descriptionRelevant
      ? `\nSỬ DỤNG MÔ TẢ NHƯ SPEC (QUAN TRỌNG):
- Trích xuất MỌI yêu cầu / acceptance criteria / ràng buộc / con số / tên endpoint / tên field xuất hiện trong mô tả và PHẢI phản ánh vào các bước tương ứng.
- Mọi con số cụ thể trong mô tả (VD: "access_token 15 phút", "refresh_token 7 ngày", "password >= 8 ký tự") PHẢI được nhắc đúng trong description của bước có liên quan, không diễn đạt mơ hồ.
- Mọi endpoint cụ thể (VD: "POST /auth/register", "POST /auth/login") PHẢI xuất hiện nguyên văn trong title hoặc description của bước tương ứng.
- Mọi field / shape response cụ thể (VD: "{ user, access_token, refresh_token }") PHẢI xuất hiện trong description của bước tương ứng.
- Nếu mô tả nêu N yêu cầu rõ ràng, breakdown PHẢI có đủ các bước phủ toàn bộ N yêu cầu đó, không được bỏ sót.
- KHÔNG bịa chi tiết ngoài mô tả; nếu mô tả không nêu, chỉ bổ sung bước tiêu chuẩn tối thiểu (thiết kế schema, test, review).`
      : descriptionRaw
        ? `\nLƯU Ý: Mô tả người dùng nhập có vẻ không liên quan trực tiếp tới title. Bỏ qua mô tả, chỉ breakdown dựa trên title và profile.`
        : "";

    const buildPrompt = (
      extraGuidance = "",
    ) => `Hãy breakdown công việc sau thành một QUY TRÌNH LÀM VIỆC (workflow) có thứ tự, mỗi bước là MỘT hành động/deliverable cụ thể.
Công việc: ${input.title}
${descriptionText}
${deadlineText}
${profileLines.join("\n")}
${totalHint}

Yêu cầu bắt buộc:
- Breakdown phải như cách một người thực sự làm công việc đó ngoài thực tế, KHÔNG phải giáo trình.
- Mỗi bước = 1 hành động cụ thể, có thể bắt tay làm ngay (actionable), có output rõ ràng.
- KHÔNG dùng tiêu đề chung chung kiểu "Tìm hiểu...", "Học...", "Khái niệm..." trừ khi level là intern/fresher/student.
- Số bước hợp lý theo quy mô công việc (đa số 5-12 bước; chỉ liệt kê 1 bước / 1 chủ đề).
- Sắp xếp theo thứ tự thực hiện thực tế (phân tích → thiết kế → triển khai → test → review/deploy).
- Trả về DUY NHẤT JSON hợp lệ (không markdown, không giải thích).
- Format: { "steps": [ { "title": string, "status": "todo", "estimatedDuration": number (phút), "difficulty": "easy"|"medium"|"hard", "description": string } ], "totalEstimatedDuration": number (phút) }
- status luôn là "todo".
- estimatedDuration là thời gian thực tế để HOÀN THÀNH bước đó (phút), theo tốc độ của level đã nêu.
- difficulty: "easy" / "medium" / "hard" theo mức phức tạp kỹ thuật của bước đó.
- description: 1-2 câu mô tả output / acceptance criteria của bước.
- totalEstimatedDuration = tổng estimatedDuration của tất cả bước.
${groundingGuidance}
${descriptionSpecGuidance}
${domainGuidance}
${scopeGuidance}
${negativeGuidance}
${levelGuidance}
${extraGuidance}`;

    const generateSteps = async (extraGuidance = "") => {
      const result = await aiProvider.chat({
        purpose: "breakdown",
        responseFormat: "json_object",
        messages: [
          {
            role: "system",
            content:
              "You are a productivity assistant. Reply in Vietnamese. You MUST respond with valid JSON only, no markdown, no explanation.",
          },
          {
            role: "user",
            content: buildPrompt(extraGuidance),
          },
        ],
        temperature: 0.2,
        maxTokens: 2000,
      });

      let raw = (result.content || "").trim();

      raw = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      let parsed: any;
      try {
        parsed = JSON.parse(extractJson(raw));
      } catch {
        try {
          parsed = JSON.parse(repairTruncatedJson(raw));
          console.warn("[aiBreakdown] JSON repaired via repairTruncatedJson");
        } catch {
          console.error(
            "[aiBreakdown] AI_JSON_INVALID. Raw response (first 500 chars):",
            raw.slice(0, 500),
          );
          throw new Error("AI_JSON_INVALID");
        }
      }

      const rawSteps = Array.isArray(parsed?.steps) ? parsed.steps : null;
      if (!rawSteps) {
        throw new Error("AI_RESPONSE_INVALID");
      }

      const normalized = rawSteps
        .map((s: any) => ({
          title: String(s?.title ?? "").trim(),
          status: String(s?.status ?? "todo").trim() || "todo",
          estimatedDuration:
            typeof s?.estimatedDuration === "number" && s.estimatedDuration > 0
              ? s.estimatedDuration
              : undefined,
          difficulty: ["easy", "medium", "hard"].includes(
            String(s?.difficulty ?? "").toLowerCase(),
          )
            ? (String(s.difficulty).toLowerCase() as "easy" | "medium" | "hard")
            : undefined,
          description: String(s?.description ?? "").trim() || undefined,
        }))
        .filter((s: any) => s.title);

      if (!normalized.length) {
        throw new Error("AI_RESPONSE_INVALID");
      }

      return normalized.map((s: any) => ({
        title: s.title,
        status:
          s.status === "todo" ||
          s.status === "in_progress" ||
          s.status === "completed" ||
          s.status === "cancelled"
            ? s.status
            : "todo",
        estimatedDuration: s.estimatedDuration as number | undefined,
        difficulty: s.difficulty as "easy" | "medium" | "hard" | undefined,
        description: s.description as string | undefined,
      }));
    };

    let steps: Awaited<ReturnType<typeof generateSteps>>;
    try {
      steps = await generateSteps();
    } catch (firstErr: any) {
      if (firstErr?.message === "AI_JSON_INVALID") {
        console.warn(
          "[aiBreakdown] First attempt failed (AI_JSON_INVALID). Retrying with stricter prompt...",
        );
        steps = await generateSteps(
          "\n⚠️ LẦN TRƯỚC BẠN TRẢ VỀ JSON KHÔNG HỢP LỆ. LẦN NÀY BẮT BUỘC:\n- Chỉ trả JSON thuần, KHÔNG markdown, KHÔNG giải thích, KHÔNG ```.\n- Bắt đầu bằng { và kết thúc bằng }.\n- Kiểm tra JSON hợp lệ trước khi trả.",
        );
      } else {
        throw firstErr;
      }
    }

    const strongBackendHints = [
      "schema",
      "database",
      "jwt",
      "middleware",
      "redis",
      "queue",
      "lockout",
      "audit",
      "totp",
    ];
    const strongFrontendHints = [
      "ui",
      "ux",
      "component",
      "responsive",
      "layout",
      "css",
      "figma",
      "animation",
      "screen",
      "form",
    ];
    const forbiddenWhenNotExplicit = [
      "deploy",
      "production",
      "prod",
      "2fa",
      "totp",
      "audit log",
      "lockout",
      "kubernetes",
      "terraform",
    ];

    const hasTaskAnchors = anchorSet.size >= 3;
    const JACCARD_THRESHOLD = 0.12;
    const ungroundedCount = steps.filter(
      (step: { title: string; description?: string }) => {
        if (!hasTaskAnchors) return false;
        const stepTokens = new Set(
          tokenize(`${step.title} ${step.description ?? ""}`),
        );
        // Jaccard similarity: |A ∩ B| / |A ∪ B|
        let intersection = 0;
        for (const token of stepTokens) {
          if (anchorSet.has(token)) intersection++;
        }
        const union = anchorSet.size + stepTokens.size - intersection;
        const jaccard = union > 0 ? intersection / union : 0;
        return jaccard < JACCARD_THRESHOLD;
      },
    ).length;

    const hasCrossDomainMismatch =
      (hasFrontendHint &&
        !hasBackendHint &&
        steps.some((step: { title: string; description?: string }) => {
          const text = `${step.title} ${step.description ?? ""}`.toLowerCase();
          return strongBackendHints.some((k) => text.includes(k));
        })) ||
      (hasBackendHint &&
        !hasFrontendHint &&
        steps.some((step: { title: string; description?: string }) => {
          const text = `${step.title} ${step.description ?? ""}`.toLowerCase();
          return strongFrontendHints.some((k) => text.includes(k));
        }));
    const hasOutOfScopeAdvancedOps =
      !explicitlyRequestsAdvancedOps &&
      steps.some((step: { title: string; description?: string }) => {
        const text = `${step.title} ${step.description ?? ""}`.toLowerCase();
        return forbiddenWhenNotExplicit.some((k) => text.includes(k));
      });

    const breakdownJoinedText = steps
      .map(
        (s: { title: string; description?: string }) =>
          `${s.title} ${s.description ?? ""}`,
      )
      .join("\n")
      .toLowerCase();

    const criticalLiterals: string[] = [];
    if (descriptionRelevant && descriptionRaw) {
      const descLower = descriptionRaw.toLowerCase();

      // 1) HTTP endpoints: VD "POST /auth/register"
      const endpointRe = /\b(?:get|post|put|patch|delete)\s+\/[\w\/\-:{}]+/gi;
      const endpoints = descriptionRaw.match(endpointRe) ?? [];
      for (const e of endpoints) criticalLiterals.push(e.trim());

      // 2) Số + đơn vị: "15 phút", "7 ngày", "8 ký tự", "10 giây"
      const numUnitRe =
        /\d+\s*(?:phút|giây|ngày|tuần|tháng|giờ|ký tự|characters?|bytes?|mb|kb)/gi;
      const numUnits = descriptionRaw.match(numUnitRe) ?? [];
      for (const n of numUnits) criticalLiterals.push(n.trim());

      // 3) Identifier snake_case: access_token, refresh_token, user_id
      const idRe = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g;
      const ids = descLower.match(idRe) ?? [];
      for (const id of ids) criticalLiterals.push(id);

      // 4) JSON shape: { ... , ... } có ít nhất 2 phần
      const shapeRe = /\{[^{}\n]{3,}\}/g;
      const shapes = descriptionRaw.match(shapeRe) ?? [];
      for (const sh of shapes) criticalLiterals.push(sh.trim());
    }

    const uniqueLiterals = Array.from(new Set(criticalLiterals)).filter(
      (s) => s.length > 0,
    );

    const missingLiterals = uniqueLiterals.filter((lit) => {
      const needle = lit.toLowerCase();
      if (needle.startsWith("{")) {
        // shape → check có ≥ 80% identifier con xuất hiện
        const ids = (needle.match(/[a-z_][a-z0-9_]+/g) ?? []).filter(
          (x) => x.length >= 3,
        );
        if (ids.length === 0) return !breakdownJoinedText.includes(needle);
        const present = ids.filter((x) => breakdownJoinedText.includes(x));
        return present.length < Math.ceil(ids.length * 0.8);
      }
      return !breakdownJoinedText.includes(needle);
    });

    const needsRetry =
      (hasTaskAnchors && ungroundedCount > Math.floor(steps.length / 2)) ||
      hasCrossDomainMismatch ||
      hasOutOfScopeAdvancedOps ||
      missingLiterals.length > 0;

    if (needsRetry) {
      const parts: string[] = [];
      parts.push("SELF-CHECK BẮT BUỘC: Bản breakdown trước chưa đạt.");
      if (
        (hasTaskAnchors && ungroundedCount > Math.floor(steps.length / 2)) ||
        hasCrossDomainMismatch ||
        hasOutOfScopeAdvancedOps
      ) {
        parts.push(
          `- Viết lại breakdown bám sát mục tiêu task, loại bỏ mọi bước ngoài phạm vi.`,
        );
        parts.push(
          `- Tập trung theo các từ khóa chính: ${anchorKeywords.join(", ") || input.title}.`,
        );
        parts.push(
          `- TUYỆT ĐỐI không thêm deploy/production/2FA/audit/lockout nếu task không yêu cầu.`,
        );
      }
      if (missingLiterals.length > 0) {
        parts.push(
          `- BẮT BUỘC phản ánh ĐẦY ĐỦ các chi tiết sau từ mô tả (đưa nguyên văn vào title/description của bước phù hợp, KHÔNG diễn đạt lại mơ hồ):`,
        );
        for (const lit of missingLiterals) {
          parts.push(`  • ${lit}`);
        }
        parts.push(
          `- Nếu có response shape JSON, ghi nguyên văn shape đó trong description của bước tương ứng.`,
        );
        parts.push(
          `- Nếu có endpoint cụ thể, ĐƯA NGUYÊN VĂN endpoint vào title của bước implement API đó.`,
        );
      }
      const retryGuidance = "\n" + parts.join("\n");
      console.log(
        `[aiBreakdown] Retry due to ${missingLiterals.length > 0 ? `missing literals: ${missingLiterals.join(" | ")}` : "grounding issue"}`,
      );
      steps = await generateSteps(retryGuidance);
    }

    if (input.totalMinutes && input.totalMinutes > 0 && steps.length > 0) {
      const currentTotal = steps.reduce(
        (sum: number, s: { estimatedDuration?: number }) =>
          sum + (s.estimatedDuration ?? 60),
        0,
      );
      if (currentTotal > 0) {
        const scale = input.totalMinutes / currentTotal;

        const scaledDurations = steps.map((s: { estimatedDuration?: number }) =>
          Math.max(5, (s.estimatedDuration ?? 60) * scale),
        );

        const roundedDurations = scaledDurations.map(
          (d: number) => Math.floor(d / 5) * 5,
        );

        const roundedTotal = roundedDurations.reduce(
          (sum: number, d: number) => sum + d,
          0,
        );
        let remainder = input.totalMinutes - roundedTotal;

        const fractionalParts = scaledDurations.map((d: number, i: number) => ({
          index: i,
          fraction: d - roundedDurations[i],
        }));

        fractionalParts.sort(
          (
            a: { index: number; fraction: number },
            b: { index: number; fraction: number },
          ) => b.fraction - a.fraction,
        );

        for (let i = 0; i < fractionalParts.length && remainder >= 5; i++) {
          const idx = fractionalParts[i].index;
          roundedDurations[idx] += 5;
          remainder -= 5;
        }

        if (remainder > 0) {
          roundedDurations[roundedDurations.length - 1] += remainder;
        }

        steps = steps.map(
          (
            s: {
              title: string;
              status: string;
              estimatedDuration?: number;
              difficulty?: "easy" | "medium" | "hard";
              description?: string;
            },
            i: number,
          ) => ({
            ...s,
            estimatedDuration: Math.max(5, roundedDurations[i]),
          }),
        );
      }
    }

    const response = {
      steps,
      totalEstimatedDuration:
        input.totalMinutes && input.totalMinutes > 0
          ? input.totalMinutes
          : steps.reduce(
              (sum: number, s: { estimatedDuration?: number }) =>
                sum + (s.estimatedDuration ?? 0),
              0,
            ),
    };

    await aiCacheService.setTaskBreakdown(
      {
        userId,
        title: input.title,
        deadline: input.deadline,
        description: input.description,
        totalMinutes: input.totalMinutes,
        profileKey,
        model: breakdownPromptVersion,
      },
      response,
    );

    return response;
  },

  prioritySuggest: async (
    userId: string,
    input: { title: string; deadline?: Date },
  ): Promise<{ priority: string; reason?: string }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    const cached = await aiCacheService.getPrioritySuggest({
      userId,
      title: input.title,
      deadline: input.deadline,
    });
    if (cached) {
      return cached;
    }

    const deadlineText = input.deadline
      ? `Hạn chót: ${input.deadline.toISOString()}`
      : "";

    const prompt = `Hãy đề xuất mức độ ưu tiên cho công việc sau, dựa trên mức độ khẩn cấp và tác động.
Công việc: ${input.title}
${deadlineText}

Yêu cầu bắt buộc:
- Trả về DUY NHẤT JSON hợp lệ (không markdown, không giải thích).
- Format: { "priority": "low"|"medium"|"high"|"urgent", "reason": string }`;

    const result = await aiProvider.chat({
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content:
            "You are a productivity assistant. Reply in Vietnamese. You MUST respond with valid JSON only, no markdown, no explanation.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      maxTokens: 300,
    });

    const raw = (result.content || "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      throw new Error("AI_JSON_INVALID");
    }

    const priorityRaw = String(parsed?.priority ?? "").trim();
    const reason =
      parsed?.reason !== undefined && parsed?.reason !== null
        ? String(parsed.reason).trim()
        : undefined;

    const normalizedPriority =
      priorityRaw === "low" ||
      priorityRaw === "medium" ||
      priorityRaw === "high" ||
      priorityRaw === "urgent"
        ? priorityRaw
        : "medium";

    const response = { priority: normalizedPriority, reason };

    await aiCacheService.setPrioritySuggest(
      { userId, title: input.title, deadline: input.deadline },
      response,
    );

    return response;
  },
};
