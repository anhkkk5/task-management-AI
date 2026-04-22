/**
 * Shared catalog: industries -> positions -> available levels.
 * Dùng cho:
 *  - UI chọn khi tạo team + khi gán vị trí cho thành viên
 *  - Thuật toán AI nhân hệ số giờ làm theo level
 *
 * NGUYÊN TẮC:
 *  - Level dùng chung 1 enum cho mọi ngành (intern..pm).
 *  - Mỗi industry chỉ expose subset level hợp lý (availableLevels).
 *  - `multiplier` càng lớn => người làm càng chậm (intern >1), càng nhỏ => nhanh (senior <1).
 */

export type LevelCode =
  | "intern"
  | "fresher"
  | "junior"
  | "middle"
  | "senior"
  | "lead"
  | "manager"
  | "pm"
  | "student"
  | "lecturer";

export type TeamType = "student" | "company";

export interface LevelInfo {
  code: LevelCode;
  label: string;
  /** Hệ số nhân thời gian hoàn thành task so với chuẩn middle=1.0 */
  multiplier: number;
}

export interface PositionInfo {
  code: string;
  label: string;
  /** Mặc định khi member mới được gán vị trí này */
  defaultLevel: LevelCode;
}

export interface IndustryInfo {
  code: string;
  label: string;
  positions: PositionInfo[];
  availableLevels: LevelCode[];
}

export const LEVELS: Record<LevelCode, LevelInfo> = {
  intern: { code: "intern", label: "Intern / Thực tập", multiplier: 1.5 },
  fresher: { code: "fresher", label: "Fresher / Mới ra trường", multiplier: 1.3 },
  junior: { code: "junior", label: "Junior", multiplier: 1.1 },
  middle: { code: "middle", label: "Middle", multiplier: 1.0 },
  senior: { code: "senior", label: "Senior", multiplier: 0.85 },
  lead: { code: "lead", label: "Lead / Trưởng nhóm", multiplier: 0.85 },
  manager: { code: "manager", label: "Manager / Quản lý", multiplier: 0.9 },
  pm: { code: "pm", label: "Project Manager", multiplier: 0.95 },
  student: { code: "student", label: "Sinh viên", multiplier: 1.4 },
  lecturer: { code: "lecturer", label: "Giảng viên", multiplier: 0.9 },
};

const IT_LEVELS: LevelCode[] = [
  "intern",
  "fresher",
  "junior",
  "middle",
  "senior",
  "lead",
  "pm",
];

const BUSINESS_LEVELS: LevelCode[] = [
  "intern",
  "junior",
  "middle",
  "senior",
  "lead",
  "manager",
];

const EDUCATION_LEVELS: LevelCode[] = [
  "student",
  "intern",
  "fresher",
  "junior",
  "middle",
  "senior",
  "lecturer",
];

export const INDUSTRIES: IndustryInfo[] = [
  {
    code: "it_software",
    label: "CNTT / Phần mềm",
    availableLevels: IT_LEVELS,
    positions: [
      { code: "backend", label: "Backend Developer", defaultLevel: "junior" },
      { code: "frontend", label: "Frontend Developer", defaultLevel: "junior" },
      { code: "fullstack", label: "Fullstack Developer", defaultLevel: "junior" },
      { code: "mobile", label: "Mobile Developer", defaultLevel: "junior" },
      { code: "devops", label: "DevOps Engineer", defaultLevel: "middle" },
      { code: "data", label: "Data Engineer / Analyst", defaultLevel: "junior" },
      { code: "ai_ml", label: "AI / ML Engineer", defaultLevel: "middle" },
      { code: "qa", label: "QA / Tester", defaultLevel: "junior" },
      { code: "ba", label: "Business Analyst", defaultLevel: "middle" },
      { code: "pm_it", label: "Project Manager", defaultLevel: "pm" },
      { code: "designer_ux", label: "UI / UX Designer", defaultLevel: "middle" },
    ],
  },
  {
    code: "marketing",
    label: "Marketing / Truyền thông",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "content", label: "Content Marketing", defaultLevel: "junior" },
      { code: "seo", label: "SEO Specialist", defaultLevel: "junior" },
      { code: "sem", label: "SEM / Ads", defaultLevel: "junior" },
      { code: "social", label: "Social Media", defaultLevel: "junior" },
      { code: "pr", label: "PR", defaultLevel: "middle" },
      { code: "designer_mkt", label: "Graphic Designer", defaultLevel: "junior" },
      { code: "videographer", label: "Videographer / Editor", defaultLevel: "junior" },
      { code: "brand", label: "Brand Manager", defaultLevel: "manager" },
    ],
  },
  {
    code: "design",
    label: "Thiết kế sáng tạo",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "graphic", label: "Graphic Designer", defaultLevel: "junior" },
      { code: "uiux", label: "UI / UX Designer", defaultLevel: "middle" },
      { code: "motion", label: "Motion Designer", defaultLevel: "middle" },
      { code: "product", label: "Product Designer", defaultLevel: "middle" },
      { code: "illustrator", label: "Illustrator", defaultLevel: "middle" },
    ],
  },
  {
    code: "finance",
    label: "Tài chính / Kế toán",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "accountant", label: "Kế toán", defaultLevel: "junior" },
      { code: "auditor", label: "Kiểm toán", defaultLevel: "middle" },
      { code: "fin_analyst", label: "Financial Analyst", defaultLevel: "middle" },
      { code: "banker", label: "Banker / Ngân hàng", defaultLevel: "middle" },
      { code: "cfo", label: "CFO / Giám đốc tài chính", defaultLevel: "manager" },
    ],
  },
  {
    code: "sales",
    label: "Kinh doanh / Sales",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "sale_exec", label: "Sales Executive", defaultLevel: "junior" },
      { code: "account", label: "Account Manager", defaultLevel: "middle" },
      { code: "bd", label: "Business Development", defaultLevel: "middle" },
      { code: "sales_manager", label: "Sales Manager", defaultLevel: "manager" },
    ],
  },
  {
    code: "hr",
    label: "Nhân sự",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "recruiter", label: "Recruiter", defaultLevel: "junior" },
      { code: "hrbp", label: "HR Business Partner", defaultLevel: "middle" },
      { code: "ld", label: "Learning & Development", defaultLevel: "middle" },
      { code: "hr_manager", label: "HR Manager", defaultLevel: "manager" },
    ],
  },
  {
    code: "education",
    label: "Giáo dục / Nghiên cứu",
    availableLevels: EDUCATION_LEVELS,
    positions: [
      { code: "student", label: "Sinh viên", defaultLevel: "student" },
      { code: "tutor", label: "Trợ giảng", defaultLevel: "junior" },
      { code: "teacher", label: "Giáo viên", defaultLevel: "middle" },
      { code: "lecturer", label: "Giảng viên", defaultLevel: "lecturer" },
      { code: "researcher", label: "Nghiên cứu viên", defaultLevel: "middle" },
    ],
  },
  {
    code: "healthcare",
    label: "Y tế / Chăm sóc sức khỏe",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "doctor", label: "Bác sĩ", defaultLevel: "middle" },
      { code: "nurse", label: "Điều dưỡng", defaultLevel: "junior" },
      { code: "pharmacist", label: "Dược sĩ", defaultLevel: "junior" },
      { code: "technician", label: "Kỹ thuật viên", defaultLevel: "junior" },
    ],
  },
  {
    code: "engineering",
    label: "Kỹ thuật / Xây dựng",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "mech", label: "Kỹ sư Cơ khí", defaultLevel: "junior" },
      { code: "ee", label: "Kỹ sư Điện", defaultLevel: "junior" },
      { code: "civil", label: "Kỹ sư Xây dựng", defaultLevel: "junior" },
      { code: "architect", label: "Kiến trúc sư", defaultLevel: "middle" },
      { code: "pm_eng", label: "Project Manager", defaultLevel: "manager" },
    ],
  },
  {
    code: "content_media",
    label: "Nội dung / Truyền thông",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "writer", label: "Biên tập / Writer", defaultLevel: "junior" },
      { code: "editor", label: "Editor", defaultLevel: "middle" },
      { code: "translator", label: "Biên dịch", defaultLevel: "junior" },
      { code: "journalist", label: "Phóng viên", defaultLevel: "middle" },
    ],
  },
  {
    code: "legal",
    label: "Pháp lý",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "paralegal", label: "Paralegal", defaultLevel: "junior" },
      { code: "lawyer", label: "Luật sư", defaultLevel: "middle" },
      { code: "legal_manager", label: "Legal Manager", defaultLevel: "manager" },
    ],
  },
  {
    code: "other",
    label: "Khác",
    availableLevels: BUSINESS_LEVELS,
    positions: [
      { code: "member", label: "Thành viên", defaultLevel: "junior" },
      { code: "leader", label: "Trưởng nhóm", defaultLevel: "lead" },
      { code: "manager", label: "Quản lý", defaultLevel: "manager" },
    ],
  },
];

export function getIndustry(code: string | undefined | null): IndustryInfo | null {
  if (!code) return null;
  return INDUSTRIES.find((i) => i.code === code) || null;
}

export function getPosition(
  industryCode: string | undefined | null,
  positionCode: string | undefined | null,
): PositionInfo | null {
  const industry = getIndustry(industryCode);
  if (!industry || !positionCode) return null;
  return industry.positions.find((p) => p.code === positionCode) || null;
}

export function isValidIndustry(code: string | undefined | null): boolean {
  return !!getIndustry(code);
}

export function isValidPosition(
  industryCode: string | undefined | null,
  positionCode: string | undefined | null,
): boolean {
  return !!getPosition(industryCode, positionCode);
}

export function isValidLevelForIndustry(
  industryCode: string | undefined | null,
  levelCode: string | undefined | null,
): boolean {
  const industry = getIndustry(industryCode);
  if (!industry) return !!levelCode && levelCode in LEVELS;
  return (
    !!levelCode &&
    industry.availableLevels.includes(levelCode as LevelCode)
  );
}

export function getLevelMultiplier(levelCode: string | undefined | null): number {
  if (!levelCode) return 1.0;
  const level = LEVELS[levelCode as LevelCode];
  return level ? level.multiplier : 1.0;
}
