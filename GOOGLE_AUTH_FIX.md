# 🔧 FIX: Google OAuth Token Issue

## 📋 Vấn đề

Sau khi login Google thành công, khi click vào modal thêm lịch, hệ thống yêu cầu login lại Google.

**Nguyên nhân:** Token không được lưu vào memory sau Google OAuth callback, dẫn đến request không có Authorization header.

---

## ✅ Giải pháp (Hybrid Approach)

### **File 1: Backend - auth.controller.ts**

**Thay đổi:** Endpoint `GET /auth/me` bây giờ trả về `accessToken`

```typescript
// ✅ TRƯỚC:
res.status(200).json({
  id: String(user._id),
  email: user.email,
  name: user.name,
  role: user.role,
  avatar: user.avatar,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// ✅ SAU:
const accessToken = authService.generateAccessToken({
  userId: String(user._id),
  email: user.email,
  role: user.role,
});

res.status(200).json({
  accessToken, // ✅ NEW
  user: {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  },
});
```

**Lợi ích:**

- Frontend có thể set accessToken vào memory
- Axios sẽ gửi Authorization header cho request tiếp theo
- Fallback: Cookie vẫn được gửi (withCredentials: true)

---

### **File 2: Backend - auth.service.ts**

**Thay đổi:** Thêm public method `generateAccessToken`

```typescript
// ✅ NEW:
generateAccessToken: (payload: {
  userId: string;
  email: string;
  role: UserRole;
}): string => {
  return signAccessToken(payload);
},
```

**Lợi ích:**

- Reusable method để generate token
- Sử dụng cùng logic với login thường
- Đảm bảo consistency

---

### **File 3: Frontend - GoogleCallback/index.tsx**

**Thay đổi:** Set accessToken vào memory sau khi getMe()

```typescript
// ✅ TRƯỚC:
getMe().then((res) => {
  const userData = res.user || res;
  dispatch(checkLogin({ status: true, user: userData }));
  message.success("Đăng nhập Google thành công!");
  navigate("/tasks", { replace: true });
});

// ✅ SAU:
getMe().then((res) => {
  // ✅ NEW: Extract accessToken from response
  const accessToken = res.accessToken;
  const userData = res.user || res;

  // ✅ NEW: Set accessToken in memory for subsequent requests
  if (accessToken) {
    setAccessToken(accessToken);
    console.log("[GoogleCallback] AccessToken set in memory");
  }

  dispatch(checkLogin({ status: true, user: userData }));
  message.success("Đăng nhập Google thành công!");
  navigate("/tasks", { replace: true });
});
```

**Lợi ích:**

- AccessToken được lưu vào memory
- Axios interceptor sẽ tự động thêm Authorization header
- Request tiếp theo sẽ có token

---

## 🔄 Chuỗi sự kiện sau fix

```
1. Người dùng login Google
   ├─ Backend set httpOnly cookie ✓
   └─ Backend redirect sang callback

2. GoogleCallback component mount
   ├─ getMe() → Backend trả về { accessToken, user }
   ├─ setAccessToken(accessToken) ✓ NEW
   ├─ dispatch(checkLogin(...))
   └─ Redirect sang /tasks

3. Người dùng click modal thêm lịch
   ├─ createTask() → Axios gửi request
   ├─ Interceptor: Authorization = `Bearer ${accessToken}` ✓
   ├─ Cookie cũng được gửi (withCredentials: true) ✓
   ├─ Backend nhận token từ header hoặc cookie
   └─ ✅ Request thành công!

4. Kết quả
   ├─ ✅ Không cần login lại
   ├─ ✅ Modal thêm lịch hoạt động
   └─ ✅ UX tốt hơn
```

---

## 🧪 Cách test

1. **Xóa cache/cookies:**
   - Mở DevTools → Application → Clear all

2. **Login Google:**
   - Click "Đăng nhập Google"
   - Xác thực với Google
   - Kiểm tra console: `[GoogleCallback] AccessToken set in memory`

3. **Click modal thêm lịch:**
   - Vào trang Calendar
   - Click vào ô lịch
   - Modal mở → Nhập thông tin → Click "Lưu"
   - ✅ Không cần login lại

4. **Kiểm tra Network:**
   - DevTools → Network
   - Khi click "Lưu", request POST /tasks
   - Headers: `Authorization: Bearer eyJhbGc...` ✓

---

## 🔒 Security Notes

✅ **httpOnly Cookie:**

- Backend set cookie với `httpOnly: true`
- Browser tự động gửi với mỗi request
- JavaScript không thể truy cập (XSS protection)

✅ **Memory Token:**

- Lưu trong memory (không localStorage)
- Mất khi refresh page (bình thường)
- Axios interceptor sẽ refresh token tự động

✅ **Hybrid Approach:**

- Vừa có token trong memory (Authorization header)
- Vừa có cookie backup (withCredentials)
- Nếu token hết hạn → Axios refresh tự động
- Nếu refresh fail → Redirect sang login

---

## 📝 Summary

| Trước                           | Sau                                |
| ------------------------------- | ---------------------------------- |
| ❌ Token không được lưu         | ✅ Token được lưu vào memory       |
| ❌ Request không có header      | ✅ Request có Authorization header |
| ❌ Backend không tìm thấy token | ✅ Backend tìm thấy token          |
| ❌ 401 → Redirect login         | ✅ Request thành công              |
| ❌ Phải login lại               | ✅ Không cần login lại             |

---

## 🚀 Deployment

Không cần migration hoặc config thay đổi. Chỉ cần:

1. Deploy backend changes
2. Deploy frontend changes
3. Clear browser cache
4. Test Google OAuth flow

Done! ✅
