/**
 * Test Script: Conflict Detection
 * Run: node test-conflict.js
 */

const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("\n🧪 TEST CONFLICT DETECTION & SCHEDULED STATUS\n");
console.log("=".repeat(60));

const steps = [
  {
    title: "📋 Step 1: Start Backend Server",
    instructions: [
      "Open terminal in AI-powered-task-management folder",
      "Run: npm run dev",
      'Wait for: "App listening on port 3002"',
      "Keep this terminal open",
    ],
    expected: [
      "✅ Server running on port 3002",
      "✅ MongoDB connected",
      "✅ Redis connected",
      "✅ Cache cleanup job started",
    ],
  },
  {
    title: "🌐 Step 2: Start Frontend",
    instructions: [
      "Open NEW terminal in web-taskmanagerment-AI/web-task-AI folder",
      "Run: npm run dev",
      'Wait for: "Local: http://localhost:5173/"',
      "Open browser: http://localhost:5173/tasks",
    ],
    expected: [
      "✅ Frontend running on port 5173",
      "✅ Can access tasks page",
      "✅ Can login successfully",
    ],
  },
  {
    title: "📝 Step 3: Create Task A",
    instructions: [
      'Click "Thêm công việc"',
      "Tiêu đề: Test Task A - học tiếng anh",
      "Thời gian dự kiến: 2h",
      "Mục tiêu/ngày: 1h-1h",
      "Hạn chót: 11/3/2026",
      'Click "Tạo công việc"',
    ],
    expected: [
      '✅ Task created with status = "Chưa xử lý" (todo)',
      "✅ Task appears in task list",
      "✅ No errors in console",
    ],
  },
  {
    title: "🤖 Step 4: AI Schedule Task A",
    instructions: [
      'Click "AI Tối Ưu Lịch"',
      "Select Task A",
      'Click "Phân tích và tạo lịch"',
      "Wait 5-10 seconds for AI",
      'Click "Áp dụng lịch trình"',
    ],
    expected: [
      '✅ Success message: "Đã lưu lịch trình"',
      '✅ Task A status → "Đã lên lịch" (scheduled) ⭐',
      '✅ Task A has time: e.g. "08:00 - 09:00"',
      "✅ Backend console: [Conflict Detection] Found 0 scheduled tasks",
    ],
  },
  {
    title: "📝 Step 5: Create Task B",
    instructions: [
      'Click "Thêm công việc"',
      "Tiêu đề: Test Task B - học code",
      "Thời gian dự kiến: 2h",
      "Mục tiêu/ngày: 1h-1h",
      "Hạn chót: 11/3/2026",
      'Click "Tạo công việc"',
    ],
    expected: [
      '✅ Task B created with status = "Chưa xử lý" (todo)',
      "✅ Task B appears in task list",
    ],
  },
  {
    title: "🔍 Step 6: AI Schedule Task B (CONFLICT DETECTION TEST)",
    instructions: [
      'Click "AI Tối Ưu Lịch"',
      "Select ONLY Task B (NOT Task A)",
      'Click "Phân tích và tạo lịch"',
      "⭐ CHECK BACKEND CONSOLE LOGS ⭐",
      'Click "Áp dụng lịch trình"',
    ],
    expected: [
      "✅ Backend console: [Conflict Detection] Found 1 scheduled tasks",
      "✅ Backend console: [Scheduler] Date 2026-03-07: 1 busy slots",
      "✅ Task B scheduled at DIFFERENT TIME than Task A",
      '✅ Task B status → "Đã lên lịch" (scheduled)',
      "✅ NO OVERLAP between Task A and Task B",
      "✅ Buffer time (15 min) between tasks",
    ],
    verify: [
      "Task A: 08:00 - 09:00 ✓",
      "Task B: 09:15 - 10:15 ✓ (15 min buffer)",
      "Gap: 15 minutes → NO CONFLICT! 🎉",
    ],
  },
  {
    title: "🎨 Step 7: Test Status Dropdown",
    instructions: [
      "In task list, click on Task A status tag",
      "Dropdown should appear",
      'Click "Đang làm" (in_progress)',
      "Wait for loading",
      "Click status tag again",
      'Click "Đã lên lịch" (scheduled)',
    ],
    expected: [
      "✅ Dropdown shows 5 options:",
      "   - Chưa xử lý (gray)",
      "   - Đã lên lịch (blue) ⭐ NEW",
      "   - Đang làm (orange)",
      "   - Hoàn thành (green)",
      "   - Đã hủy (red)",
      "✅ Status changes successfully",
      "✅ Success message appears",
      "✅ Task list auto-refreshes",
    ],
  },
  {
    title: "📊 Step 8: Test Multiple Conflicts",
    instructions: [
      'Create Task C: "Test Task C - tiếng hàn", 1h, 1h-1h, 11/3/2026',
      'Click "AI Tối Ưu Lịch"',
      "Select ONLY Task C",
      'Click "Phân tích và tạo lịch"',
      "⭐ CHECK BACKEND CONSOLE ⭐",
      'Click "Áp dụng lịch trình"',
    ],
    expected: [
      "✅ Backend console: [Conflict Detection] Found 2 scheduled tasks",
      "✅ Backend console: [Scheduler] Date 2026-03-07: 2 busy slots",
      "✅ Task C scheduled avoiding BOTH Task A and Task B",
      "✅ Timeline:",
      "   08:00 - 09:00: Task A ✓",
      "   09:15 - 10:15: Task B ✓",
      "   10:30 - 11:30: Task C ✓",
    ],
  },
  {
    title: "✅ Step 9: Verify Success",
    instructions: [
      'Check all tasks have status "Đã lên lịch"',
      "Check no time overlaps",
      "Check buffer time between tasks",
      "Check backend console logs",
      "Check MongoDB database (optional)",
    ],
    expected: [
      '✅ All tasks status = "scheduled"',
      "✅ No overlapping times",
      "✅ 10-15 min buffer between tasks",
      "✅ Console logs show conflict detection",
      "✅ No errors in frontend or backend",
    ],
  },
];

function printStep(step, index) {
  console.log(`\n${step.title}`);
  console.log("-".repeat(60));

  console.log("\n📝 Instructions:");
  step.instructions.forEach((instruction, i) => {
    console.log(`   ${i + 1}. ${instruction}`);
  });

  console.log("\n✅ Expected Results:");
  step.expected.forEach((exp) => {
    console.log(`   ${exp}`);
  });

  if (step.verify) {
    console.log("\n🔍 Verify:");
    step.verify.forEach((v) => {
      console.log(`   ${v}`);
    });
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function runTest() {
  for (let i = 0; i < steps.length; i++) {
    printStep(steps[i], i);

    console.log("\n" + "=".repeat(60));
    const answer = await askQuestion(
      '\nPress ENTER to continue to next step (or type "q" to quit): ',
    );

    if (answer.toLowerCase() === "q") {
      console.log("\n👋 Test stopped by user\n");
      rl.close();
      return;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n🎉 TEST COMPLETE!\n");
  console.log("✅ Success Checklist:");
  console.log(
    '   [ ] Task status auto-updates to "scheduled" when AI schedule',
  );
  console.log('   [ ] Status dropdown has "Đã lên lịch" option');
  console.log(
    "   [ ] Console log shows: [Conflict Detection] Found X scheduled tasks",
  );
  console.log("   [ ] New tasks avoid old tasks (no overlap)");
  console.log("   [ ] Buffer time applied (10-15 minutes)");
  console.log("   [ ] User can manually change status");
  console.log("   [ ] Filter by status works");
  console.log("\n📊 If all checkboxes pass → System works perfectly! 🚀\n");
  console.log("📝 For detailed guide, open: test-conflict-detection.html\n");
  console.log("=".repeat(60) + "\n");

  rl.close();
}

// Run the test
runTest().catch((err) => {
  console.error("Error:", err);
  rl.close();
});
