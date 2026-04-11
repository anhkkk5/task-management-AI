# 🚀 Quick Test Reference - Conflict Detection

## ⚡ 30-Second Test

```bash
# 1. Start servers
cd AI-powered-task-management && npm run dev
cd web-task-AI && npm run dev

# 2. Open browser
http://localhost:5173/tasks

# 3. Create 2 tasks → AI Schedule both separately
# 4. Check: No time overlap + Backend logs show conflict detection
```

---

## 📋 Test Checklist (5 minutes)

| Step | Action             | Expected Result                    | ✓   |
| ---- | ------------------ | ---------------------------------- | --- |
| 1    | Create Task A (2h) | Status = "Chưa xử lý"              | ☐   |
| 2    | AI Schedule Task A | Status → "Đã lên lịch"             | ☐   |
| 3    | Create Task B (2h) | Status = "Chưa xử lý"              | ☐   |
| 4    | AI Schedule Task B | Console: "Found 1 scheduled tasks" | ☐   |
| 5    | Check times        | Task B ≠ Task A (no overlap)       | ☐   |
| 6    | Click status tag   | Dropdown shows "Đã lên lịch"       | ☐   |
| 7    | Change status      | Updates successfully               | ☐   |

---

## 🔍 What to Look For

### ✅ Success Indicators:

- Backend console: `[Conflict Detection] Found X scheduled tasks`
- Tasks have different time slots
- 10-15 minute buffer between tasks
- Status auto-updates to "Đã lên lịch"
- Dropdown has 5 status options

### ❌ Failure Indicators:

- Tasks overlap in time
- Console: `[Conflict Detection] Found 0 scheduled tasks` (when should be > 0)
- Status stays "Chưa xử lý" after AI schedule
- No "Đã lên lịch" option in dropdown

---

## 🎯 Expected Timeline

```
Task A: 08:00 - 09:00 ✓
        [15 min buffer]
Task B: 09:15 - 10:15 ✓
        [15 min buffer]
Task C: 10:30 - 11:30 ✓
```

---

## 🐛 Quick Fixes

### Problem: Status không chuyển

```bash
# Restart backend
npm run dev
```

### Problem: Conflict detection không hoạt động

```bash
# Check database
db.tasks.find({ status: "scheduled" })

# Clear cache
redis-cli FLUSHALL
```

### Problem: Tasks overlap

```bash
# Reset all tasks
db.tasks.updateMany(
  { status: "scheduled" },
  { $set: { status: "todo" } }
)
```

---

## 📁 Test Files

| File                           | Purpose      | How to Use              |
| ------------------------------ | ------------ | ----------------------- |
| `test-conflict-detection.html` | Visual guide | Open in browser         |
| `test-conflict.js`             | CLI guide    | `node test-conflict.js` |
| `test-conflict-api.http`       | API tests    | VS Code REST Client     |
| `TEST_CONFLICT_DETECTION.md`   | Full guide   | Read for details        |

---

## 💡 Pro Tips

1. **Always check backend console** for conflict detection logs
2. **Use different deadlines** to test priority sorting
3. **Test with 3+ tasks** to verify multiple conflicts
4. **Try manual status changes** to test dropdown
5. **Check MongoDB** to verify data persistence

---

## 🎉 Success Criteria

All these should be TRUE:

- ✅ Status auto-updates to "scheduled"
- ✅ Console shows conflict detection
- ✅ No time overlaps
- ✅ Buffer time between tasks
- ✅ Dropdown works
- ✅ No errors in console

---

## 📞 Need Help?

1. Read: `DEMO_NOTIFICATION.md` - Overview
2. Read: `TEST_CONFLICT_DETECTION.md` - Detailed guide
3. Run: `node test-conflict.js` - Interactive test
4. Open: `test-conflict-detection.html` - Visual guide

---

**Ready? Let's test! 🚀**
