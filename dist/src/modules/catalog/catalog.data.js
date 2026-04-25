"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDUSTRIES = exports.LEVELS = void 0;
exports.getIndustry = getIndustry;
exports.getPosition = getPosition;
exports.isValidIndustry = isValidIndustry;
exports.isValidPosition = isValidPosition;
exports.isValidLevelForIndustry = isValidLevelForIndustry;
exports.getLevelMultiplier = getLevelMultiplier;
exports.getLevelsForIndustry = getLevelsForIndustry;
exports.getLevelInfoForIndustry = getLevelInfoForIndustry;
exports.LEVELS = {
    intern: { code: "intern", label: "Intern / Thực tập", multiplier: 1.5 },
    fresher: {
        code: "fresher",
        label: "Fresher / Mới ra trường",
        multiplier: 1.3,
    },
    junior: { code: "junior", label: "Junior", multiplier: 1.1 },
    middle: { code: "middle", label: "Middle", multiplier: 1.0 },
    senior: { code: "senior", label: "Senior", multiplier: 0.85 },
    lead: { code: "lead", label: "Lead / Trưởng nhóm", multiplier: 0.85 },
    manager: { code: "manager", label: "Manager / Quản lý", multiplier: 0.9 },
    pm: { code: "pm", label: "Project Manager", multiplier: 0.95 },
    student: { code: "student", label: "Sinh viên", multiplier: 1.4 },
    lecturer: { code: "lecturer", label: "Giảng viên", multiplier: 0.9 },
};
const IT_LEVELS = [
    "intern",
    "fresher",
    "junior",
    "middle",
    "senior",
    "lead",
    "pm",
];
const BUSINESS_LEVELS = [
    "intern",
    "junior",
    "middle",
    "senior",
    "lead",
    "manager",
];
const EDUCATION_LEVELS = [
    "student",
    "intern",
    "fresher",
    "junior",
    "middle",
    "senior",
    "lecturer",
];
const MARKETING_LEVEL_LABELS = {
    intern: "Intern / Thực tập sinh",
    junior: "Executive",
    middle: "Senior Executive / Specialist",
    senior: "Senior Specialist",
    lead: "Team Lead",
    manager: "Marketing Manager",
};
const DESIGN_LEVEL_LABELS = {
    intern: "Design Intern",
    junior: "Junior Designer",
    middle: "Designer / Senior Designer",
    senior: "Art Director",
    lead: "Design Lead",
    manager: "Creative Manager",
};
const FINANCE_LEVEL_LABELS = {
    intern: "Intern / Thực tập",
    junior: "Associate",
    middle: "Senior Associate / Specialist",
    senior: "Senior Specialist",
    lead: "Team Lead",
    manager: "Finance Manager",
};
const SALES_LEVEL_LABELS = {
    intern: "Sales Intern",
    junior: "Sales Executive",
    middle: "Senior Executive / Account Executive",
    senior: "Senior Account / Consultant",
    lead: "Sales Team Lead",
    manager: "Sales Manager",
};
const HR_LEVEL_LABELS = {
    intern: "HR Intern",
    junior: "HR Executive",
    middle: "Senior Executive / HR Specialist",
    senior: "Senior HR Specialist",
    lead: "HR Lead",
    manager: "HR Manager",
};
const HEALTHCARE_LEVEL_LABELS = {
    intern: "Thực tập / Tập sự",
    junior: "Nhân viên / Chuyên viên",
    middle: "Bác sĩ / Chuyên viên chính",
    senior: "Chuyên gia cao cấp",
    lead: "Trưởng nhóm chuyên môn",
    manager: "Quản lý khoa / bộ phận",
};
const ENGINEERING_LEVEL_LABELS = {
    intern: "Intern / Tập sự",
    junior: "Engineer",
    middle: "Senior Engineer",
    senior: "Principal Engineer",
    lead: "Engineering Lead",
    manager: "Engineering Manager",
};
const CONTENT_MEDIA_LEVEL_LABELS = {
    intern: "Content Intern",
    junior: "Writer / Content Executive",
    middle: "Senior Writer / Editor",
    senior: "Senior Editor",
    lead: "Content Lead",
    manager: "Content Manager",
};
const LEGAL_LEVEL_LABELS = {
    intern: "Legal Intern",
    junior: "Legal Associate",
    middle: "Senior Associate / Counsel",
    senior: "Senior Counsel",
    lead: "Legal Lead",
    manager: "Legal Manager",
};
exports.INDUSTRIES = [
    {
        code: "it_software",
        label: "CNTT / Phần mềm",
        availableLevels: IT_LEVELS,
        levelLabels: {
            intern: "Intern / Thực tập",
            fresher: "Fresher / Mới ra trường",
            junior: "Junior",
            middle: "Middle",
            senior: "Senior",
            lead: "Lead / Trưởng nhóm",
            pm: "Project Manager",
        },
        positions: [
            { code: "backend", label: "Backend Developer", defaultLevel: "junior" },
            { code: "frontend", label: "Frontend Developer", defaultLevel: "junior" },
            {
                code: "fullstack",
                label: "Fullstack Developer",
                defaultLevel: "junior",
            },
            { code: "mobile", label: "Mobile Developer", defaultLevel: "junior" },
            { code: "devops", label: "DevOps Engineer", defaultLevel: "middle" },
            {
                code: "data",
                label: "Data Engineer / Analyst",
                defaultLevel: "junior",
            },
            { code: "ai_ml", label: "AI / ML Engineer", defaultLevel: "middle" },
            { code: "qa", label: "QA / Tester", defaultLevel: "junior" },
            { code: "ba", label: "Business Analyst", defaultLevel: "middle" },
            { code: "pm_it", label: "Project Manager", defaultLevel: "pm" },
            {
                code: "designer_ux",
                label: "UI / UX Designer",
                defaultLevel: "middle",
            },
        ],
    },
    {
        code: "marketing",
        label: "Marketing / Truyền thông",
        availableLevels: BUSINESS_LEVELS,
        levelLabels: MARKETING_LEVEL_LABELS,
        positions: [
            { code: "content", label: "Content Marketing", defaultLevel: "junior" },
            { code: "seo", label: "SEO Specialist", defaultLevel: "junior" },
            { code: "sem", label: "SEM / Ads", defaultLevel: "junior" },
            { code: "social", label: "Social Media", defaultLevel: "junior" },
            { code: "pr", label: "PR", defaultLevel: "middle" },
            {
                code: "designer_mkt",
                label: "Graphic Designer",
                defaultLevel: "junior",
            },
            {
                code: "videographer",
                label: "Videographer / Editor",
                defaultLevel: "junior",
            },
            { code: "brand", label: "Brand Manager", defaultLevel: "manager" },
        ],
    },
    {
        code: "design",
        label: "Thiết kế sáng tạo",
        availableLevels: BUSINESS_LEVELS,
        levelLabels: DESIGN_LEVEL_LABELS,
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
        levelLabels: FINANCE_LEVEL_LABELS,
        positions: [
            { code: "accountant", label: "Kế toán", defaultLevel: "junior" },
            { code: "auditor", label: "Kiểm toán", defaultLevel: "middle" },
            {
                code: "fin_analyst",
                label: "Financial Analyst",
                defaultLevel: "middle",
            },
            { code: "banker", label: "Banker / Ngân hàng", defaultLevel: "middle" },
            {
                code: "cfo",
                label: "CFO / Giám đốc tài chính",
                defaultLevel: "manager",
            },
        ],
    },
    {
        code: "sales",
        label: "Kinh doanh / Sales",
        availableLevels: BUSINESS_LEVELS,
        levelLabels: SALES_LEVEL_LABELS,
        positions: [
            { code: "sale_exec", label: "Sales Executive", defaultLevel: "junior" },
            { code: "account", label: "Account Manager", defaultLevel: "middle" },
            { code: "bd", label: "Business Development", defaultLevel: "middle" },
            {
                code: "sales_manager",
                label: "Sales Manager",
                defaultLevel: "manager",
            },
        ],
    },
    {
        code: "hr",
        label: "Nhân sự",
        availableLevels: BUSINESS_LEVELS,
        levelLabels: HR_LEVEL_LABELS,
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
        levelLabels: {
            student: "Sinh viên",
            intern: "Trợ giảng tập sự",
            fresher: "Giáo viên mới",
            junior: "Giáo viên / Nghiên cứu viên",
            middle: "Giáo viên chính",
            senior: "Giáo viên cao cấp",
            lecturer: "Giảng viên",
        },
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
        levelLabels: HEALTHCARE_LEVEL_LABELS,
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
        levelLabels: ENGINEERING_LEVEL_LABELS,
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
        levelLabels: CONTENT_MEDIA_LEVEL_LABELS,
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
        levelLabels: LEGAL_LEVEL_LABELS,
        positions: [
            { code: "paralegal", label: "Paralegal", defaultLevel: "junior" },
            { code: "lawyer", label: "Luật sư", defaultLevel: "middle" },
            {
                code: "legal_manager",
                label: "Legal Manager",
                defaultLevel: "manager",
            },
        ],
    },
    {
        code: "other",
        label: "Khác",
        availableLevels: BUSINESS_LEVELS,
        levelLabels: {
            intern: "Intern",
            junior: "Nhân viên",
            middle: "Chuyên viên",
            senior: "Chuyên viên cao cấp",
            lead: "Trưởng nhóm",
            manager: "Quản lý",
        },
        positions: [
            { code: "member", label: "Thành viên", defaultLevel: "junior" },
            { code: "leader", label: "Trưởng nhóm", defaultLevel: "lead" },
            { code: "manager", label: "Quản lý", defaultLevel: "manager" },
        ],
    },
];
function getIndustry(code) {
    if (!code)
        return null;
    return exports.INDUSTRIES.find((i) => i.code === code) || null;
}
function getPosition(industryCode, positionCode) {
    const industry = getIndustry(industryCode);
    if (!industry || !positionCode)
        return null;
    return industry.positions.find((p) => p.code === positionCode) || null;
}
function isValidIndustry(code) {
    return !!getIndustry(code);
}
function isValidPosition(industryCode, positionCode) {
    return !!getPosition(industryCode, positionCode);
}
function isValidLevelForIndustry(industryCode, levelCode) {
    const industry = getIndustry(industryCode);
    if (!industry)
        return !!levelCode && levelCode in exports.LEVELS;
    return (!!levelCode && industry.availableLevels.includes(levelCode));
}
function getLevelMultiplier(levelCode) {
    if (!levelCode)
        return 1.0;
    const level = exports.LEVELS[levelCode];
    return level ? level.multiplier : 1.0;
}
function getLevelsForIndustry(industryCode) {
    const industry = getIndustry(industryCode);
    const codes = industry?.availableLevels || Object.keys(exports.LEVELS);
    return codes
        .map((code) => {
        const base = exports.LEVELS[code];
        if (!base)
            return null;
        return {
            ...base,
            label: industry?.levelLabels?.[code] || base.label,
        };
    })
        .filter((x) => !!x);
}
function getLevelInfoForIndustry(industryCode, levelCode) {
    if (!levelCode)
        return null;
    return (getLevelsForIndustry(industryCode).find((x) => x.code === levelCode) || null);
}
