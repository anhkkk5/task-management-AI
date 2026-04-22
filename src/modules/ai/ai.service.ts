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
import { extractJson } from "./ai-utils";

// Re-export từ các service đã tách
export { aiChatService } from "./ai-chat.service";
export { aiScheduleService } from "./ai-schedule.service";
export { aiRescheduleService } from "./ai-reschedule.service";

// Các functions còn lại trong ai.service.ts
export const aiService = {
  // Các methods được re-export từ file con
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

    const breakdownPromptVersion = "task-breakdown-v5-ai-era-speed";

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
      // Nếu cached nhưng totalMinutes khác → bỏ qua cache, tính lại
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

    const descriptionText = input.description
      ? `Mô tả: ${input.description}`
      : "";

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

    const anchorKeywords = Array.from(
      new Set(
        tokenize(`${input.title} ${input.description ?? ""}`).filter(
          (t) => t.length >= 3 && !stopWords.has(t),
        ),
      ),
    ).slice(0, 12);
    const anchorSet = new Set(anchorKeywords);
    const groundingGuidance =
      anchorKeywords.length > 0
        ? `\nRÀNG BUỘC BÁM SÁT NGỮ CẢNH:
- Tự xác định domain chính từ title/description rồi bám chặt domain đó.
- Mỗi bước phải đóng góp trực tiếp vào output của task, dùng ngôn ngữ bám theo các từ khóa sau: ${anchorKeywords.join(", ")}.
- Không tự mở rộng sang domain khác nếu không có tín hiệu rõ trong task.`
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
${domainGuidance}
${scopeGuidance}
${negativeGuidance}
${levelGuidance}
${extraGuidance}`;

    const generateSteps = async (extraGuidance = "") => {
      const result = await aiProvider.chat({
        purpose: "breakdown",
        messages: [
          {
            role: "system",
            content:
              "You are a productivity assistant. Reply in Vietnamese. Always output valid JSON when asked.",
          },
          {
            role: "user",
            content: buildPrompt(extraGuidance),
          },
        ],
        temperature: 0.2,
        maxTokens: 2000,
      });

      const raw = (result.content || "").trim();

      let parsed: any;
      try {
        parsed = JSON.parse(extractJson(raw));
      } catch {
        throw new Error("AI_JSON_INVALID");
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

    let steps = await generateSteps();

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
    const ungroundedCount = steps.filter(
      (step: { title: string; description?: string }) => {
        if (!hasTaskAnchors) return false;
        const stepTokens = tokenize(`${step.title} ${step.description ?? ""}`);
        return !stepTokens.some((token) => anchorSet.has(token));
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

    if (
      (hasTaskAnchors && ungroundedCount > Math.floor(steps.length / 2)) ||
      hasCrossDomainMismatch ||
      hasOutOfScopeAdvancedOps
    ) {
      const retryGuidance = `\nSELF-CHECK BẮT BUỘC: Bản breakdown trước có bước lệch ngữ cảnh.
- Viết lại breakdown bám sát mục tiêu task.
- Loại bỏ mọi bước ngoài phạm vi.
- Tập trung theo các từ khóa chính: ${anchorKeywords.join(", ") || input.title}.
- TUYỆT ĐỐI không thêm deploy/production/2FA/audit/lockout nếu task không yêu cầu.`;
      steps = await generateSteps(retryGuidance);
    }

    // Post-processing: scale thời gian để tổng = totalMinutes chính xác
    if (input.totalMinutes && input.totalMinutes > 0 && steps.length > 0) {
      const currentTotal = steps.reduce(
        (sum: number, s: { estimatedDuration?: number }) =>
          sum + (s.estimatedDuration ?? 60),
        0,
      );
      if (currentTotal > 0) {
        const scale = input.totalMinutes / currentTotal;

        // Bước 1: Scale tất cả subtasks (chưa làm tròn)
        const scaledDurations = steps.map((s: { estimatedDuration?: number }) =>
          Math.max(5, (s.estimatedDuration ?? 60) * scale),
        );

        // Bước 2: Làm tròn xuống bội số 5 cho tất cả
        const roundedDurations = scaledDurations.map(
          (d: number) => Math.floor(d / 5) * 5,
        );

        // Bước 3: Tính phần dư cần phân bổ
        const roundedTotal = roundedDurations.reduce(
          (sum: number, d: number) => sum + d,
          0,
        );
        let remainder = input.totalMinutes - roundedTotal;

        // Bước 4: Phân bổ phần dư (mỗi lần +5 phút) cho các subtask có phần lẻ lớn nhất
        const fractionalParts = scaledDurations.map((d: number, i: number) => ({
          index: i,
          fraction: d - roundedDurations[i],
        }));

        // Sắp xếp theo phần lẻ giảm dần
        fractionalParts.sort(
          (
            a: { index: number; fraction: number },
            b: { index: number; fraction: number },
          ) => b.fraction - a.fraction,
        );

        // Phân bổ phần dư
        for (let i = 0; i < fractionalParts.length && remainder >= 5; i++) {
          const idx = fractionalParts[i].index;
          roundedDurations[idx] += 5;
          remainder -= 5;
        }

        // Bước 5: Nếu vẫn còn dư (< 5 phút), cộng vào subtask cuối
        if (remainder > 0) {
          roundedDurations[roundedDurations.length - 1] += remainder;
        }

        // Bước 6: Gán lại estimatedDuration
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
      messages: [
        {
          role: "system",
          content:
            "You are a productivity assistant. Reply in Vietnamese. Always output valid JSON when asked.",
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
