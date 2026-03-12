# Cache Invalidation Strategy

## Vấn đề đã gặp:

Sau khi sửa code (chuyển từ AI service sang Hybrid Algorithm), kết quả vẫn hiển thị cũ vì **Redis cache** chưa được xóa.

## Các loại cache trong hệ thống:

### 1. In-Memory Cache (Backend)

**Location:** `src/modules/scheduler/cache.service.ts`

```typescript
export const slotCache = new CacheService(5); // 5 phút
export const productivityCache = new CacheService(60); // 1 giờ
export const busySlotsCache = new CacheService(2); // 2 phút
```

**Tự động expire:** Có TTL, tự xóa sau thời gian

### 2. Redis Cache (Backend)

**Location:** `src/modules/ai/ai.cache.service.ts`

```typescript
const AI_CACHE_TTL_SECONDS = 300; // 5 phút

Keys:
- ai:task-breakdown:{userId}:{titleHash}:{deadline}:{model}
- ai:priority-suggest:{userId}:{titleHash}:{deadline}:{model}
- ai:prompt:{promptHash}
```

**Cần xóa thủ công** khi thay đổi logic AI

### 3. Frontend Cache (Browser)

- LocalStorage
- SessionStorage
- Service Worker cache
- HTTP cache headers

## Khi nào cần invalidate cache:

### ✅ BẮT BUỘC xóa cache khi:

1. **Thay đổi thuật toán scheduling**
   - Chuyển từ AI sang Hybrid
   - Thay đổi workHours
   - Thay đổi buffer time
   - Thay đổi breaks

2. **Thay đổi AI prompt**
   - Sửa prompt template
   - Thay đổi logic phân tích

3. **Thay đổi business logic**
   - Thay đổi cách tính dailyTarget
   - Thay đổi productivity scoring

### ⚠️ NÊN xóa cache khi:

1. Deploy version mới
2. Fix bug liên quan đến scheduling
3. Thay đổi model AI

### ℹ️ KHÔNG cần xóa cache khi:

1. Sửa UI/frontend
2. Thêm logging
3. Refactor code không thay đổi logic

## Cách xóa cache:

### Option 1: Xóa tất cả Redis cache (Recommended khi deploy)

```bash
# Connect to Redis
redis-cli

# Xóa tất cả keys
FLUSHALL

# Hoặc chỉ xóa keys của app
KEYS ai:*
# Sau đó xóa từng key hoặc dùng pattern
DEL ai:task-breakdown:*
```

### Option 2: Xóa cache của user cụ thể

```typescript
// Trong code
await aiCacheService.invalidateUserAiCache(userId);
```

### Option 3: Xóa in-memory cache

```typescript
// Trong code
slotCache.clear();
productivityCache.clear();
busySlotsCache.clear();
```

### Option 4: Restart server (xóa in-memory cache)

```bash
pm2 restart all
# hoặc
npm run dev
```

### Option 5: Clear browser cache (Frontend)

```
Ctrl + Shift + R (Hard refresh)
# hoặc
F12 > Application > Clear storage
```

## Best Practices:

### 1. Thêm version vào cache key

```typescript
const CACHE_VERSION = "v2"; // Tăng khi thay đổi logic

const cacheKey = `${CACHE_VERSION}:schedule:${userId}:${date}`;
```

### 2. Thêm API endpoint để clear cache

```typescript
// src/modules/admin/admin.routes.ts
router.post("/clear-cache", adminMiddleware, async (req, res) => {
  await aiCacheService.invalidateAllCache();
  slotCache.clear();
  productivityCache.clear();
  res.json({ message: "Cache cleared" });
});
```

### 3. Tự động invalidate khi deploy

```bash
# deploy.sh
npm run build
pm2 restart all

# Clear Redis cache
redis-cli FLUSHALL

echo "Deployed and cache cleared"
```

### 4. Thêm cache headers cho API response

```typescript
// Không cache response của schedule API
res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
res.setHeader("Pragma", "no-cache");
res.setHeader("Expires", "0");
```

### 5. Log cache hits/misses

```typescript
const cached = slotCache.get(key);
if (cached) {
  console.log(`[Cache HIT] ${key}`);
  return cached;
}
console.log(`[Cache MISS] ${key}`);
```

## Monitoring:

### Check Redis cache size:

```bash
redis-cli INFO memory
redis-cli DBSIZE
```

### Check cache keys:

```bash
redis-cli KEYS ai:*
redis-cli TTL ai:schedule:user123:2026-03-07
```

### Check in-memory cache:

```typescript
console.log("Slot cache stats:", slotCache.getStats());
console.log("Productivity cache stats:", productivityCache.getStats());
```

## Troubleshooting:

### Vấn đề: Kết quả vẫn cũ sau khi deploy

**Giải pháp:**

1. Xóa Redis cache: `redis-cli FLUSHALL`
2. Restart server: `pm2 restart all`
3. Clear browser cache: `Ctrl + Shift + R`

### Vấn đề: Cache không expire

**Kiểm tra:**

```bash
redis-cli TTL ai:schedule:user123:2026-03-07
# Nếu trả về -1 = không có TTL
# Nếu trả về -2 = key không tồn tại
# Nếu trả về số > 0 = còn X giây
```

### Vấn đề: Memory leak do cache

**Giải pháp:**

- Đảm bảo có TTL cho mọi cache entry
- Implement cleanup job
- Monitor memory usage

## Kết luận:

Khi thay đổi logic scheduling/AI:

1. ✅ Build code mới
2. ✅ **XÓA REDIS CACHE** (quan trọng!)
3. ✅ Restart server
4. ✅ Test kỹ

Đừng quên bước 2! 😄
