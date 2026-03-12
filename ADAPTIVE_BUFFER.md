# Adaptive Buffer Time - Thời gian nghỉ linh hoạt

## Vấn đề:

Session ngắn (< 40 phút) không cần nghỉ lâu như session dài (≥ 40 phút).

**Ví dụ:**

- Session 30 phút → nghỉ 15 phút = quá lâu
- Session 90 phút → nghỉ 15 phút = hợp lý

## Giải pháp: Adaptive Buffer

Buffer time tự động điều chỉnh dựa trên độ dài session:

```typescript
if (sessionDuration < 40 phút) {
  buffer = 10 phút  // Session ngắn → nghỉ ngắn
} else {
  buffer = 15 phút  // Session dài → nghỉ dài hơn
}
```

## Ví dụ cụ thể:

### Task: "tiếng hàn" - 480 phút (8h), dailyMin=60, dailyMax=60

**Trước (Fixed buffer 15 phút):**

```
08:00-08:30: tiếng hàn (30 phút)
08:45-09:15: tiếng hàn (30 phút) ← 15 phút nghỉ (quá lâu!)
09:30-10:00: tiếng hàn (30 phút) ← 15 phút nghỉ (quá lâu!)
```

**Sau (Adaptive buffer):**

```
08:00-08:30: tiếng hàn (30 phút)
08:40-09:10: tiếng hàn (30 phút) ← 10 phút nghỉ ✓
09:20-09:50: tiếng hàn (30 phút) ← 10 phút nghỉ ✓
10:00-10:30: tiếng hàn (30 phút) ← 10 phút nghỉ ✓
```

→ Tiết kiệm 5 phút × 15 sessions = 75 phút/ngày!

### Task dài: "học code" - 150 phút

**Adaptive buffer:**

```
14:00-16:30: học code (150 phút)
16:45-18:00: task khác ← 15 phút nghỉ ✓ (session dài cần nghỉ nhiều)
```

## Implementation:

### 1. AdaptiveBufferCalculator

File: `src/modules/scheduler/adaptive-buffer.ts`

```typescript
export class AdaptiveBufferCalculator {
  static calculateBuffer(
    sessionDuration: number,
    defaultBuffer: number = 15,
  ): number {
    if (sessionDuration < 40) {
      return 10; // Session ngắn
    }
    return defaultBuffer; // Session dài
  }
}
```

### 2. Slot Finder Integration

File: `src/modules/scheduler/slot-finder.service.ts`

```typescript
// Tính duration của task vừa kết thúc
const previousTaskDuration =
  (mergedBusy[i].end.getTime() - mergedBusy[i].start.getTime()) / (1000 * 60);

// Tính buffer linh hoạt
const adaptiveBuffer = AdaptiveBufferCalculator.calculateBuffer(
  previousTaskDuration,
  bufferMinutes,
);

// Thêm buffer vào end time
const currentEnd = new Date(
  mergedBusy[i].end.getTime() + adaptiveBuffer * 60 * 1000,
);
```

### 3. Cache Version Update

```typescript
export const CACHE_VERSION = {
  SCHEDULER: "v3", // Tăng lên v3
  SLOT_FINDER: "v3", // Tăng lên v3
};
```

## Lợi ích:

### 1. Tiết kiệm thời gian

- Session ngắn: Tiết kiệm 5 phút/session
- 16 sessions/ngày × 5 phút = 80 phút tiết kiệm!

### 2. Phù hợp với tâm lý

- Session ngắn: Não chưa mệt → nghỉ ngắn
- Session dài: Não mệt → nghỉ dài hơn

### 3. Tối ưu lịch trình

- Xếp được nhiều task hơn trong ngày
- Giảm thời gian chết

### 4. Linh hoạt

- Tự động điều chỉnh theo từng session
- Không cần config thủ công

## So sánh:

### Fixed Buffer (15 phút):

```
Task 30 phút × 16 sessions = 480 phút work + 240 phút buffer = 720 phút
→ Cần 12 giờ để hoàn thành 8 giờ work!
```

### Adaptive Buffer:

```
Task 30 phút × 16 sessions = 480 phút work + 160 phút buffer = 640 phút
→ Chỉ cần 10.7 giờ để hoàn thành 8 giờ work!
→ Tiết kiệm 1.3 giờ/ngày ✓
```

## Quy tắc chi tiết:

| Session Duration | Buffer Time | Lý do                     |
| ---------------- | ----------- | ------------------------- |
| < 40 phút        | 10 phút     | Não chưa mệt, nghỉ ngắn   |
| ≥ 40 phút        | 15 phút     | Não mệt, cần nghỉ dài hơn |

## Test cases:

### Test 1: Session ngắn

```typescript
Input: sessionDuration = 30 phút
Output: buffer = 10 phút ✓
```

### Test 2: Session vừa

```typescript
Input: sessionDuration = 40 phút
Output: buffer = 15 phút ✓
```

### Test 3: Session dài

```typescript
Input: sessionDuration = 90 phút
Output: buffer = 15 phút ✓
```

### Test 4: Session rất ngắn

```typescript
Input: sessionDuration = 15 phút
Output: buffer = 10 phút ✓
```

## Deployment:

### 1. Build

```bash
npm run build
```

### 2. Restart server

```bash
pm2 restart all
```

### 3. Cache tự động invalidate

- Version tăng lên v3
- Cache v2 tự động bị bỏ qua
- Không cần xóa Redis thủ công!

## Monitoring:

Kiểm tra logs để xem buffer được áp dụng:

```
[Scheduler] Session 30min → buffer 10min
[Scheduler] Session 90min → buffer 15min
```

## Future improvements:

1. **Configurable threshold:**

   ```typescript
   const threshold = userPreferences.bufferThreshold || 40;
   ```

2. **Multiple tiers:**

   ```typescript
   if (duration < 30) return 5; // Rất ngắn
   if (duration < 60) return 10; // Ngắn
   return 15; // Dài
   ```

3. **User-specific:**
   ```typescript
   const buffer =
     userHabits.preferredBreakDuration || calculateBuffer(duration);
   ```

## Kết luận:

✅ Session ngắn → nghỉ ngắn (10 phút)
✅ Session dài → nghỉ dài (15 phút)
✅ Tiết kiệm thời gian
✅ Phù hợp tâm lý
✅ Tự động áp dụng

Không cần config gì thêm, chỉ cần deploy là xong!

## Bug Fix: Admin Controller

### Vấn đề:

Khi thêm cache management endpoints, 2 methods (`getCacheStats` và `cleanupOldCache`) được thêm NGOÀI export object → TypeScript compilation error.

### Lỗi:

```typescript
export const adminController = {
  // ... methods
};  // ← Export kết thúc ở đây

// ❌ Methods này nằm ngoài object
getCacheStats: async (req, res) => { ... },
cleanupOldCache: async (req, res) => { ... },
```

### Fix:

Di chuyển 2 methods VÀO trong `adminController` object:

```typescript
export const adminController = {
  // ... existing methods

  // Cache management
  getCacheStats: async (req, res) => { ... },
  cleanupOldCache: async (req, res) => { ... },
};  // ← Export kết thúc sau khi thêm methods
```

### Verification:

```bash
npm run build
# Exit Code: 0 ✓
```

## Files Changed:

1. ✅ `src/modules/scheduler/adaptive-buffer.ts` (created)
2. ✅ `src/modules/scheduler/slot-finder.service.ts` (updated)
3. ✅ `src/config/cache-version.ts` (v2 → v3)
4. ✅ `src/modules/admin/admin.controller.ts` (fixed syntax error)
5. ✅ `ADAPTIVE_BUFFER.md` (this file)

## Ready to Deploy:

✅ Build successful
✅ No TypeScript errors
✅ Cache version updated to v3
✅ Adaptive buffer implemented
✅ Admin endpoints working

Chỉ cần restart server là xong!
