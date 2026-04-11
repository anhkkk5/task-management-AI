# Auto Cache Versioning - Giải pháp tự động

## Vấn đề đã giải quyết:

❌ **Trước:** Mỗi lần thay đổi logic phải vào Redis xóa cache thủ công
✅ **Sau:** Cache tự động invalidate khi thay đổi version

## Cách hoạt động:

### 1. Cache Key với Version

**Trước:**

```
ai:prompt:abc123
ai:task-breakdown:user123:hash:deadline
freeslots:user123:2026-03-07
```

**Sau:**

```
v2:ai:prompt:abc123
v2:ai:task-breakdown:user123:hash:deadline
v2:freeslots:user123:2026-03-07
```

→ Khi tăng version lên v3, cache v2 tự động bị bỏ qua!

### 2. Version Configuration

File: `src/config/cache-version.ts`

```typescript
export const CACHE_VERSION = {
  SCHEDULER: "v2", // Tăng khi thay đổi scheduling logic
  AI: "v2", // Tăng khi thay đổi AI prompt/logic
  SLOT_FINDER: "v2", // Tăng khi thay đổi slot finding
  PRODUCTIVITY: "v1", // Chưa thay đổi
};
```

### 3. Auto Cleanup Job

Server tự động chạy cleanup job mỗi 1 giờ để xóa cache cũ:

```typescript
// Chạy tự động khi server start
cacheCleanupService.start();

// Scan và xóa tất cả keys có version cũ
// VD: Xóa v1:* khi current version là v2
```

## Khi nào cần tăng version:

### ✅ Tăng version khi:

1. **Thay đổi thuật toán:**

   ```typescript
   // Trước: Pure AI
   // Sau: Hybrid Algorithm
   CACHE_VERSION.SCHEDULER = "v3"; // Tăng lên v3
   ```

2. **Thay đổi workHours/breaks:**

   ```typescript
   // Thêm breaks mới
   CACHE_VERSION.SLOT_FINDER = "v3";
   ```

3. **Thay đổi AI prompt:**

   ```typescript
   // Sửa prompt template
   CACHE_VERSION.AI = "v3";
   ```

4. **Thay đổi business logic:**
   ```typescript
   // Thay đổi cách tính productivity
   CACHE_VERSION.PRODUCTIVITY = "v2";
   ```

### ❌ KHÔNG cần tăng version khi:

1. Sửa UI/frontend
2. Thêm logging
3. Refactor code không thay đổi output
4. Fix typo trong comment

## Workflow khi thay đổi logic:

### Bước 1: Sửa code

```typescript
// Thay đổi logic trong service
export const hybridScheduleService = {
  schedulePlan: async (...) => {
    // New logic here
  }
}
```

### Bước 2: Tăng version

```typescript
// src/config/cache-version.ts
export const CACHE_VERSION = {
  SCHEDULER: "v3", // Tăng từ v2 lên v3
  // ...
};
```

### Bước 3: Deploy

```bash
npm run build
pm2 restart all
```

### Bước 4: Tự động!

- ✅ Cache mới dùng key `v3:*`
- ✅ Cache cũ `v2:*` tự động bị bỏ qua
- ✅ Cleanup job tự động xóa `v2:*` sau 1 giờ

## API Endpoints (Admin only):

### 1. Xem cache stats

```bash
GET /admin/cache/stats

Response:
{
  "stats": {
    "totalKeys": 1234,
    "keysByVersion": {
      "v1": 100,  // Cache cũ
      "v2": 1134  // Cache hiện tại
    },
    "oldVersionKeys": 100
  }
}
```

### 2. Trigger cleanup thủ công

```bash
POST /admin/cache/cleanup

Response:
{
  "message": "Cache cleanup completed",
  "stats": {
    "totalKeys": 1134,
    "keysByVersion": {
      "v2": 1134
    },
    "oldVersionKeys": 0
  }
}
```

## Lợi ích:

### 1. Không cần xóa cache thủ công

- ❌ Trước: Vào Redis CLI → FLUSHALL
- ✅ Sau: Chỉ cần tăng version

### 2. Zero downtime

- Cache cũ vẫn hoạt động cho đến khi expire
- Cache mới được tạo song song
- Không ảnh hưởng đến user

### 3. Tiết kiệm dung lượng

- Cleanup job tự động xóa cache cũ
- Không tích tụ cache vô thời hạn

### 4. Dễ rollback

- Nếu version mới có bug, rollback về version cũ
- Cache cũ vẫn còn (chưa bị xóa hết)

### 5. Audit trail

- Biết được cache nào thuộc version nào
- Dễ debug khi có vấn đề

## Monitoring:

### Check cache trong Redis:

```bash
redis-cli

# Xem tất cả keys
KEYS *:*

# Xem keys theo version
KEYS v2:*
KEYS v1:*

# Đếm keys theo version
KEYS v2:* | wc -l
```

### Check logs:

```
[CacheCleanup] Starting cache cleanup job...
[CacheCleanup] Current versions: [ 'v2', 'v2', 'v2', 'v1' ]
[CacheCleanup] Deleted 100 old cache keys
[CacheCleanup] Total deleted: 100 old cache keys
```

## Best Practices:

### 1. Version naming convention

```typescript
// ✅ GOOD
("v1", "v2", "v3");

// ❌ BAD
("version-1", "1.0.0", "latest");
```

### 2. Document changes

```typescript
/**
 * Changelog:
 *
 * v3 (2026-03-08):
 * - Thêm support cho multiple work shifts
 * - Cải thiện productivity scoring
 *
 * v2 (2026-03-07):
 * - Thêm breaks và buffer
 * - Chuyển sang Hybrid Algorithm
 */
```

### 3. Gradual rollout

```typescript
// Nếu muốn test version mới trước
const version = process.env.CACHE_VERSION || CACHE_VERSION.SCHEDULER;
```

### 4. Monitor cleanup

```typescript
// Alert nếu có quá nhiều old cache
if (stats.oldVersionKeys > 10000) {
  console.warn("Too many old cache keys!");
}
```

## Troubleshooting:

### Vấn đề: Cache vẫn cũ sau khi tăng version

**Kiểm tra:**

1. Version đã được tăng chưa?
2. Server đã restart chưa?
3. Code đã build chưa?

```bash
# Check version trong code
cat dist/config/cache-version.js

# Check Redis keys
redis-cli KEYS v2:*
redis-cli KEYS v3:*
```

### Vấn đề: Cleanup job không chạy

**Kiểm tra logs:**

```
[CacheCleanup] Starting cache cleanup job...
```

Nếu không thấy → check server.ts đã start service chưa

### Vấn đề: Memory leak

**Giải pháp:**

- Giảm TTL của cache
- Tăng tần suất cleanup
- Monitor Redis memory

## Kết luận:

✅ **Không cần xóa cache thủ công nữa!**
✅ **Chỉ cần tăng version khi thay đổi logic**
✅ **Tự động cleanup cache cũ**
✅ **Tiết kiệm dung lượng Redis**

Workflow mới:

1. Sửa code
2. Tăng version
3. Deploy
4. Done! 🎉
