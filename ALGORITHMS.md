# Thuật toán & Kỹ thuật trong TaskMind AI Backend

> Tài liệu giải thích chi tiết 5 thuật toán cốt lõi được sử dụng trong hệ thống scheduling.
> Mỗi thuật toán đều có giải thích thuật ngữ IT, cách hoạt động từng bước, ví dụ minh hoạ, và vị trí code trong dự án.

---

## 1. Binary Search Conflict Detection (Phát hiện xung đột bằng tìm kiếm nhị phân)

📍 **File:** `src/modules/scheduler/scheduler.service.ts` — class `IntervalScheduler`

### Thuật ngữ cần biết

| Thuật ngữ | Tiếng Việt | Giải thích |
|-----------|-----------|------------|
| **Binary Search** | Tìm kiếm nhị phân | Thuật toán chia đôi mảng đã sắp xếp để tìm phần tử, mỗi bước loại bỏ một nửa → rất nhanh |
| **Time Complexity** | Độ phức tạp thời gian | Cách đo tốc độ thuật toán. O(n) = tuyến tính, O(log n) = logarit (rất nhanh), O(n²) = chậm |
| **Interval** | Khoảng thời gian | Một đoạn có điểm bắt đầu (start) và kết thúc (end), ví dụ: 9:00-10:00 |
| **Overlap** | Chồng chéo | Hai interval giao nhau, ví dụ: [9:00-10:30] và [10:00-11:00] |
| **Upper Bound** | Cận trên | Vị trí đầu tiên trong mảng mà giá trị ≥ giá trị cần tìm |

### Bài toán

Khi user tạo task mới (ví dụ 14:00-15:30), hệ thống cần kiểm tra xem nó có **đè lên** task nào đã có trong lịch không.

**Cách naïve (brute force):** So sánh task mới với TỪNG task đã có → O(n) mỗi lần. Nếu có 1000 tasks, phải check 1000 lần.

**Cách tối ưu (binary search):** Sort một lần, rồi dùng binary search để thu hẹp vùng cần check → O(n log n) sort + O(log n) search.

### Cách hoạt động từng bước

```
Bước 1: Sắp xếp tất cả task theo thời gian bắt đầu (start)
         [8:00-9:00] [10:00-11:00] [13:00-14:30] [16:00-17:00] [19:00-20:00]

Bước 2: Task mới: [14:00-15:30]
         → Binary search tìm "upper bound": vị trí đầu tiên có start ≥ 15:30 (end của task mới)
         → Kết quả: index 3 (task [16:00-17:00])
         → Chỉ cần check các task từ index 0 đến 2 (3 tasks thay vì 5)

Bước 3: Trong range [0..2], check từng task:
         [8:00-9:00]   → end(9:00) ≤ start(14:00) → KHÔNG conflict
         [10:00-11:00] → end(11:00) ≤ start(14:00) → KHÔNG conflict
         [13:00-14:30] → end(14:30) > start(14:00) → CONFLICT! ⚠️

Bước 4: Phát hiện conflict → đề xuất slot thay thế: [14:30-16:00] (ngay sau task xung đột)
```

### Code thực tế trong dự án

```typescript
// Binary search: tìm upper bound — vị trí đầu tiên có start ≥ newEnd
let lo = 0;
let hi = sorted.length;
while (lo < hi) {
  const mid = (lo + hi) >>> 1;           // >>> 1 tương đương Math.floor(chia 2)
  if (sorted[mid].start.getTime() < newEnd) {
    lo = mid + 1;                         // Nửa trái vẫn có thể overlap → đi phải
  } else {
    hi = mid;                             // Nửa phải chắc chắn không overlap → đi trái
  }
}
// Chỉ intervals [0..lo-1] mới có thể overlap với task mới
```

### Tại sao dùng thuật toán này?

| Tiêu chí | Brute Force | Binary Search |
|----------|-------------|---------------|
| Thời gian mỗi lần check | O(n) | O(log n) |
| 1000 tasks | ~1000 phép so sánh | ~10 phép so sánh |
| Ứng dụng | Phù hợp dữ liệu nhỏ | Phù hợp scale lớn |

---

## 2. Bayesian Productivity Scoring + Exponential Decay (Chấm điểm năng suất Bayes + Suy giảm theo thời gian)

📍 **File:** `src/modules/scheduler/productivity.service.ts` — class `ProductivityScorer`

### Thuật ngữ cần biết

| Thuật ngữ | Tiếng Việt | Giải thích |
|-----------|-----------|------------|
| **Bayesian Smoothing** | Làm mượt Bayes | Kỹ thuật kết hợp dữ liệu thực tế với "niềm tin ban đầu" (prior). Khi ít data → tin prior, nhiều data → tin data thực |
| **Exponential Decay** | Suy giảm hàm mũ | Dữ liệu cũ mất dần giá trị theo thời gian. Task làm hôm qua quan trọng hơn task làm 30 ngày trước |
| **Prior** | Tiên nghiệm / Giả định ban đầu | Giá trị mặc định dựa trên kiến thức chung (ở đây là nhịp sinh học con người) |
| **Confidence** | Độ tin cậy | Mức độ chắc chắn của dữ liệu. Nhiều mẫu → confidence cao → tin dữ liệu thực |
| **Circadian Rhythm** | Nhịp sinh học ngày đêm | Chu kỳ tự nhiên 24h của cơ thể: sáng tỉnh táo, trưa buồn ngủ, chiều phục hồi |
| **Half-life** | Chu kỳ bán rã | Thời gian để trọng số giảm còn 50%. Half-life = 10 ngày → task 10 ngày trước chỉ còn 50% trọng số |

### Bài toán

Hệ thống cần biết: **"User này làm việc hiệu quả nhất vào lúc mấy giờ?"** để xếp lịch tối ưu.

**Thách thức:**
- User mới → chưa có dữ liệu → dùng gì?
- Dữ liệu cũ 3 tháng trước → có còn chính xác không?
- Chỉ có 2-3 tasks trong giờ đó → đủ tin không?

### Cách hoạt động từng bước

**Bước 1 — Exponential Decay (Giảm trọng số theo thời gian):**

```
Ý tưởng: Task gần đây phản ánh năng suất hiện tại tốt hơn task cũ.

Công thức: weight = e^(-λ × daysAgo)
  - λ (lambda) = ln(2) / halfLife  (hằng số suy giảm)
  - halfLife = lookbackDays / 3     (chu kỳ bán rã)

Ví dụ (halfLife = 10 ngày):
  Task làm hôm nay  (daysAgo=0):  weight = e^0     = 1.00  (100%)
  Task làm 5 ngày trước:          weight = e^-0.35 = 0.71  (71%)
  Task làm 10 ngày trước:         weight = e^-0.69 = 0.50  (50%)  ← đúng half-life
  Task làm 30 ngày trước:         weight = e^-2.08 = 0.12  (12%)  ← gần như bị bỏ qua
```

**Bước 2 — Tính điểm năng suất từ dữ liệu thực (Observed Score):**

```
Với mỗi giờ (0-23h), tính:
  completionRate = tổng weight(task hoàn thành) / tổng weight(tất cả task)
  avgDuration    = tổng (duration × weight) / tổng weight
  durationScore  = clamp(avgDuration / 60, 0.3, 1.0)

  observedScore  = completionRate × 0.7 + durationScore × 0.3
                   (70% dựa vào tỷ lệ hoàn thành, 30% dựa vào thời lượng)
```

**Bước 3 — Bayesian Smoothing (Kết hợp với Circadian Rhythm Prior):**

```
Circadian Rhythm Prior (niềm tin ban đầu dựa trên nhịp sinh học):
  6h:  0.40 (mới thức, chưa tỉnh hẳn)
  9h:  0.90 (peak buổi sáng — làm việc tốt nhất)
  10h: 0.92 (đỉnh cao năng suất)
  12h: 0.50 (buồn ngủ sau ăn trưa)
  15h: 0.82 (phục hồi buổi chiều)
  22h: 0.45 (mệt cuối ngày)

Confidence = min(weightedTotal / 8, 1.0)
  - Nếu có 8+ tasks (weighted) ở giờ đó → confidence = 1.0 (tin data hoàn toàn)
  - Nếu có 2 tasks → confidence = 0.25 (chưa đủ tin, dùng nhiều prior hơn)

Điểm cuối cùng:
  finalScore = observedScore × confidence + prior × (1 - confidence)

Ví dụ: User có 2 tasks ở 9h sáng, cả 2 đều hoàn thành tốt → observedScore = 0.95
  confidence = 2/8 = 0.25
  prior (9h) = 0.90
  finalScore = 0.95 × 0.25 + 0.90 × 0.75 = 0.9125

→ Dù chỉ 2 tasks, điểm vẫn cao vì cả data lẫn prior đều cho thấy 9h tốt.
→ Nếu user có 20 tasks ở 9h → confidence = 1.0 → finalScore = observedScore (tin hoàn toàn vào data).
```

### Tại sao dùng thuật toán này?

| Tình huống | Không có Bayesian | Có Bayesian |
|------------|-------------------|-------------|
| User mới (0 task) | Không có gì để xếp lịch | Dùng circadian rhythm → xếp task khó vào 9-10h sáng |
| User có 3 tasks lúc 2h sáng (đều pass) | "2h sáng năng suất 100%!" (SAI) | Confidence thấp → blend với prior (2h = 0.08) → không xếp lịch 2h sáng |
| User lâu năm (200+ tasks) | Đúng nhưng data cũ gây nhiễu | Exponential decay loại data cũ → phản ánh thói quen hiện tại |

---

## 3. Multi-Factor Weighted Scoring (Chấm điểm đa tiêu chí có trọng số)

📍 **File:** `src/modules/scheduler/slot-finder.service.ts` — method `findOptimalSlot`

### Thuật ngữ cần biết

| Thuật ngữ | Tiếng Việt | Giải thích |
|-----------|-----------|------------|
| **Weighted Scoring** | Chấm điểm có trọng số | Mỗi tiêu chí có trọng số (weight) khác nhau. Tiêu chí quan trọng hơn → weight cao hơn |
| **Normalization** | Chuẩn hoá | Đưa tất cả điểm về cùng thang (0-1) để so sánh công bằng |
| **Slot** | Khoảng trống | Khoảng thời gian trống trong ngày mà user có thể làm việc |
| **Fragmentation** | Phân mảnh | Khi slot bị chia nhỏ thành các mảnh không dùng được (ví dụ slot 35 phút, task 30 phút → dư 5 phút vô dụng) |
| **Fitness** | Mức vừa vặn | Mức độ task "vừa" vào slot. Task 45 phút vào slot 50 phút = fitness cao |

### Bài toán

Sau khi tìm được nhiều slot trống trong ngày, hệ thống cần chọn **slot tốt nhất** cho task. "Tốt nhất" không chỉ là "có chỗ trống" mà phải cân nhắc nhiều yếu tố.

### 5 tiêu chí chấm điểm

```
totalScore = Productivity × 0.40
           + SlotFitness  × 0.20
           + PreferredTime × 0.15
           + Urgency       × 0.15
           − Fragmentation × 0.10
```

**① Productivity Score (40%) — Năng suất theo giờ:**
```
Lấy từ Bayesian Productivity Scorer (thuật toán #2).
Ví dụ: Slot 9:00 → prodScore = 0.92, Slot 20:00 → prodScore = 0.72
→ Ưu tiên xếp task vào giờ user làm việc hiệu quả nhất.
```

**② Slot Fitness (20%) — Mức vừa vặn:**
```
efficiency = taskDuration / slotDuration

Task 45 phút, slot 50 phút → efficiency = 0.90 → fitnessScore = 1.0 (vừa vặn!)
Task 45 phút, slot 180 phút → efficiency = 0.25 → fitnessScore = 0.36 (lãng phí)

Vùng hoàn hảo: efficiency 70-100% → fitnessScore = 1.0
→ Tránh nhét task nhỏ vào slot quá lớn (lãng phí thời gian rảnh cho task khác).
```

**③ Preferred Time (15%) — Sở thích thời gian:**
```
User thích buổi sáng? → slot 8-11h: prefScore = 1.0, slot khác: 0.3
User thích buổi tối? → slot 19-22h: prefScore = 1.0, slot khác: 0.3
Không có sở thích? → prefScore = 0.5 (trung lập)
```

**④ Urgency (15%) — Mức độ khẩn cấp:**
```
Dựa trên deadline + priority:

urgencyBonus = max(0, min(1, 1 − daysLeft / 7))
  - Deadline ngày mai (1 ngày) → urgency = 0.86 (rất gấp!)
  - Deadline 3 ngày nữa       → urgency = 0.57
  - Deadline 7+ ngày           → urgency = 0.00 (không gấp)

Nhân thêm priority:
  urgent × 1.0 | high × 0.7 | medium × 0.4 | low × 0.2

Nếu urgency > 0.3 → bonus thêm cho slot sớm trong ngày:
  earlyBonus = max(0, 1 − hour/24)    (slot 8h = 0.67, slot 20h = 0.17)
→ Task gấp → ưu tiên làm sớm nhất có thể.
```

**⑤ Fragmentation Penalty (10%) — Phạt phân mảnh:**
```
leftover = slotDuration − taskDuration

Task 45 phút vào slot 60 phút → leftover = 15 phút → penalty = 0.8 (mảnh nhỏ vô dụng!)
Task 45 phút vào slot 90 phút → leftover = 45 phút → penalty = 0.0 (dư đủ cho task khác)
Task 45 phút vào slot 45 phút → leftover = 0       → penalty = 0.0 (vừa khít)

→ Tránh tạo ra khoảng trống < 30 phút mà không fit được task nào khác.
```

### Ví dụ thực tế

```
Task: "Viết API endpoint" - 60 phút, deadline ngày mai, priority high, thích buổi sáng

Slot A: 9:00-10:30 (90 phút)
  Prod = 0.90×0.4=0.36 | Fit = 0.67/0.7→0.96→0.20×0.96=0.19 | Pref = 1.0×0.15=0.15
  Urg = 0.60×0.15=0.09 | Frag = (30min≥30→0.0)×0.10=0.00
  Total = 0.36 + 0.19 + 0.15 + 0.09 − 0.00 = 0.79 ✅

Slot B: 20:00-21:30 (90 phút)
  Prod = 0.72×0.4=0.29 | Fit = 0.19 | Pref = 0.3×0.15=0.045
  Urg = 0.35×0.15=0.05 | Frag = 0.00
  Total = 0.29 + 0.19 + 0.045 + 0.05 − 0.00 = 0.575

→ Slot A (9:00 sáng) thắng vì: năng suất cao + đúng sở thích + làm sớm cho task gấp.
```

---

## 4. Interval Merging + Adaptive Buffer (Gộp khoảng thời gian + Buffer nghỉ thông minh)

📍 **Files:**
- `src/modules/scheduler/scheduler.service.ts` — method `mergeIntervals`
- `src/modules/scheduler/slot-finder.service.ts` — method `findFreeSlots`
- `src/modules/scheduler/adaptive-buffer.ts` — class `AdaptiveBufferCalculator`

### Thuật ngữ cần biết

| Thuật ngữ | Tiếng Việt | Giải thích |
|-----------|-----------|------------|
| **Interval Merging** | Gộp khoảng thời gian | Gộp các khoảng thời gian chồng chéo thành một khoảng duy nhất |
| **Gap Detection** | Phát hiện khoảng trống | Tìm các khoảng trống giữa các busy intervals |
| **Buffer** | Thời gian đệm/nghỉ | Khoảng nghỉ giữa 2 tasks liên tiếp để tránh kiệt sức |
| **Pomodoro Technique** | Kỹ thuật Pomodoro | Phương pháp quản lý thời gian: làm 25 phút → nghỉ 5 phút. Dùng cà chua (pomodoro) làm timer |
| **Cumulative Fatigue** | Mệt mỏi tích luỹ | Làm việc liên tục nhiều session → cần nghỉ dài hơn |

### Bài toán

Cho danh sách các task đã có trong lịch (busy slots), tìm **tất cả khoảng trống** mà user có thể làm việc, đồng thời **chèn buffer nghỉ** hợp lý giữa các task.

### Phần A — Interval Merging (Gộp khoảng trùng)

```
Trước khi tìm khoảng trống, phải gộp các busy slots bị chồng chéo:

Input:  [9:00-10:30] [10:00-11:00] [13:00-14:00] [13:30-15:00]
                      ↑ overlap!                    ↑ overlap!

Bước 1: Sort theo start time → đã sorted
Bước 2: Duyệt từ trái sang phải:
  - [9:00-10:30] + [10:00-11:00] → 10:00 < 10:30 → OVERLAP → merge = [9:00-10:30]
  - [13:00-14:00] + [13:30-15:00] → 13:30 < 14:00 → OVERLAP → merge = [13:00-15:00]

Output: [9:00-10:30] [13:00-15:00]    (4 slots → 2 slots, không còn chồng chéo)
```

### Phần B — Gap Detection (Tìm khoảng trống)

```
Work hours: 8:00-23:00
Merged busy: [9:00-10:30] [13:00-15:00]

Tìm gaps:
  Gap 1: 8:00 → 9:00   = 60 phút  (trước task đầu tiên)
  Gap 2: 10:30 → 13:00  = 150 phút (giữa 2 tasks — TRỪ buffer)
  Gap 3: 15:00 → 23:00  = 480 phút (sau task cuối cùng — TRỪ buffer)
```

### Phần C — Adaptive Buffer (Buffer nghỉ thông minh)

Thay vì buffer cố định 15 phút, hệ thống tính buffer dựa trên **thời lượng session vừa kết thúc** (lấy cảm hứng từ Pomodoro Technique):

```
Session vừa xong     Buffer nghỉ        Lý do
─────────────────    ──────────────      ──────────────────────────
< 25 phút            5 phút              Micro break — task ngắn, não chưa mệt
25-50 phút           10 phút             Short break — tương đương 1 Pomodoro
50-90 phút           15 phút             Standard break — cần nghỉ vừa
> 90 phút            20 phút             Long break — mental reset cần thiết

Cumulative Fatigue Bonus (Mệt mỏi tích luỹ):
  Mỗi 3 session liên tiếp → +5 phút buffer thêm
  Session thứ 3 → +5 phút
  Session thứ 6 → +10 phút
  Session thứ 9 → +15 phút
  Cap tối đa: 30 phút buffer

Ví dụ thực tế (ngày làm việc):
  Task 1: 90 phút (8:00-9:30)  → buffer = 15 phút  → free từ 9:45
  Task 2: 45 phút (9:45-10:30) → buffer = 10 phút  → free từ 10:40
  Task 3: 60 phút (10:40-11:40)→ buffer = 15+5 = 20 phút (fatigue bonus!) → free từ 12:00
```

---

## 5. Hybrid AI + Heuristic Duration Estimation (Ước lượng thời gian lai ghép AI + Thuật toán)

📍 **File:** `src/modules/scheduler/hybrid-schedule.service.ts` — function `ensureTaskPlanningInputsWithMeta`

### Thuật ngữ cần biết

| Thuật ngữ | Tiếng Việt | Giải thích |
|-----------|-----------|------------|
| **Heuristic** | Phương pháp kinh nghiệm | Thuật toán dựa trên quy tắc thực tiễn, không cần AI, chạy nhanh và ổn định |
| **Logarithmic Function** | Hàm logarit | Hàm tăng nhanh ban đầu rồi chậm dần. log₂(1)=0, log₂(2)=1, log₂(8)=3, log₂(1024)=10 |
| **Multiplier** | Hệ số nhân | Số nhân điều chỉnh kết quả. multiplier 1.2 = tăng 20%, multiplier 0.7 = giảm 30% |
| **Hybrid** | Lai ghép | Kết hợp 2 phương pháp: AI (phân tích ngữ nghĩa) + Heuristic (quy tắc cứng) |
| **Keyword Matching** | Khớp từ khoá | Tìm từ khoá trong tiêu đề task để đánh giá độ phức tạp |
| **Confidence Score** | Điểm tin cậy | Mức độ chắc chắn của ước lượng. 0.5 = thấp (heuristic only), 0.8 = cao (AI xác nhận) |

### Bài toán

Khi user tạo task mà **KHÔNG nhập thời gian ước tính** (estimatedDuration), hệ thống phải tự ước lượng: "Task này mất bao lâu?"

### Pipeline 4 bước

```
Input: Task "Implement authentication API" — deadline 7 ngày — priority high
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: Heuristic Base (Ước lượng cơ sở bằng hàm logarit)        │
│                                                                     │
│  base = 45 + 95 × log₂(daysUntilDeadline)                         │
│  base = 45 + 95 × log₂(7) = 45 + 95 × 2.81 = 312 phút           │
│                                                                     │
│  Tại sao logarit? Vì task dài hạn (30 ngày) không tỉ lệ thuận:   │
│    1 ngày  → 45 phút   (task nhỏ)                                  │
│    3 ngày  → 196 phút  (task trung bình)                           │
│    7 ngày  → 312 phút  (task lớn)                                  │
│    14 ngày → 407 phút  (giảm tốc — task lớn không x2 thời gian)   │
│    30 ngày → 512 phút  (cap tại 540 phút — giới hạn hợp lý)       │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: Keyword + Priority Multipliers (Điều chỉnh theo ngữ cảnh) │
│                                                                     │
│  Priority "high" → ×1.2                                             │
│  Keyword "implement" → complex keyword → ×1.15                      │
│  (Nếu "fix" hoặc "update" → simple keyword → ×0.85)               │
│                                                                     │
│  heuristicDuration = 312 × 1.2 × 1.15 = 430 phút                  │
│                                                                     │
│  Industry-specific keywords:                                        │
│  IT: "refactor", "architecture", "deploy" → complex (×1.15)        │
│  IT: "fix", "config", "rename" → simple (×0.85)                    │
│  Marketing: "campaign", "strategy" → complex (×1.15)               │
│  Marketing: "caption", "hashtag" → simple (×0.85)                  │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: AI Difficulty Analysis (AI phân tích độ khó)              │
│                                                                     │
│  Gửi task title + description cho AI (Groq/Gemini) → nhận:         │
│    { difficulty: "hard", multiplier: 1.25 }                         │
│                                                                     │
│  Kết hợp Hybrid (60% AI + 40% Heuristic):                         │
│    aiAdjusted = 430 × 1.25 = 537.5                                 │
│    hybridDuration = 537.5 × 0.6 + 430 × 0.4 = 494.5 phút          │
│                                                                     │
│  Tại sao 60/40?                                                    │
│    - AI hiểu ngữ nghĩa tốt hơn (authentication = phức tạp)        │
│    - Nhưng AI đôi khi sai → giữ 40% heuristic làm "neo" ổn định   │
│                                                                     │
│  Timeout: Nếu AI không trả lời trong 5 giây → dùng 100% heuristic  │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4: Contextual Multipliers (Nhân hệ số ngữ cảnh)             │
│                                                                     │
│  ① Level Multiplier (theo cấp bậc):                                │
│     Intern → ×1.4 (chậm hơn)  |  Junior → ×1.2                    │
│     Middle → ×1.0 (chuẩn)     |  Senior → ×0.85 (nhanh hơn)       │
│     Lead   → ×0.75            |  Principal → ×0.7                  │
│                                                                     │
│  ② History Multiplier (theo lịch sử cá nhân):                     │
│     So sánh estimated vs actual duration của 10 tasks gần nhất      │
│     Nếu user thường xong nhanh hơn dự tính → giảm estimate         │
│     Nếu user thường chậm hơn → tăng estimate                       │
│     Range: ×0.85 đến ×1.20                                         │
│                                                                     │
│  ③ AI-Era Multiplier (hệ số thời đại AI):                         │
│     Knowledge work (code/design/marketing) → ×0.6                   │
│       (AI tools rút ngắn 40% thời gian)                            │
│     Manual work (construction/retail) → ×1.0                        │
│       (AI không thay thế được việc tay chân)                        │
│                                                                     │
│  Final = 494.5 × 1.0(middle) × 0.95(history) × 0.6(AI-era)       │
│        = 282 phút → round → 280 phút (~4.7 giờ)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Tại sao dùng Hybrid thay vì chỉ AI?

| Tiêu chí | Chỉ AI | Chỉ Heuristic | Hybrid (dự án này) |
|----------|--------|---------------|-------------------|
| Tốc độ | Chậm (1-5s API call) | Instant (<1ms) | Nhanh (fallback nếu AI timeout) |
| Chi phí | Tốn API tokens | Miễn phí | Tiết kiệm (cache AI 24h) |
| Hiểu ngữ nghĩa | Tốt ("auth" = phức tạp) | Kém (chỉ keyword) | Tốt (AI phân tích) |
| Ổn định | Đôi khi hallucinate | Luôn ổn định | Ổn định (40% heuristic neo) |
| Personalization | Không | Không | Có (history + level multiplier) |

---

## Tổng kết: Luồng hoạt động kết hợp 5 thuật toán

```
User tạo task "Viết API payment" (không nhập thời gian, deadline 5 ngày, priority urgent)
                                    ↓
┌─── Thuật toán #5: Hybrid Estimation ───┐
│ Ước lượng: 280 phút (~4.7 giờ)        │
└────────────────────────────────────────┘
                                    ↓
┌─── Thuật toán #4: Interval Merging ────┐
│ Gộp busy slots → tìm khoảng trống     │
│ + Adaptive Buffer giữa các task        │
│ → 3 free slots: 9:00, 14:00, 20:00    │
└────────────────────────────────────────┘
                                    ↓
┌─── Thuật toán #2: Bayesian Scoring ────┐
│ Tính năng suất mỗi giờ cho user này   │
│ 9h = 0.92, 14h = 0.75, 20h = 0.72    │
└────────────────────────────────────────┘
                                    ↓
┌─── Thuật toán #3: Multi-Factor Score ──┐
│ Chấm điểm 3 slots:                    │
│   9:00 → 0.79 (cao nhất) ✅            │
│  14:00 → 0.62                          │
│  20:00 → 0.54                          │
└────────────────────────────────────────┘
                                    ↓
┌─── Thuật toán #1: Binary Search ───────┐
│ Xác nhận slot 9:00 không conflict      │
│ với bất kỳ task nào đã có              │
└────────────────────────────────────────┘
                                    ↓
          Kết quả: Xếp lịch 9:00-13:40
          (4.7 giờ tại slot năng suất cao nhất,
           không xung đột, đúng sở thích user)
```
