import { productivityScorer } from "../productivity.service";
import { ProductivityScore, TaskProfile } from "../types";

describe("ProductivityScorer", () => {
  describe("calculateHourlyScores", () => {
    it("should blend completion rate with circadian prior (Bayesian)", () => {
      const completedTasks = [
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: false, duration: 30 },
        { hour: 14, completed: false, duration: 60 },
        { hour: 14, completed: false, duration: 60 },
      ];

      const scores = productivityScorer.calculateHourlyScores(completedTasks);

      // Hour 9: 2/3 completed, Bayesian blended with prior(0.90) → high score
      expect(scores.get(9)?.score).toBeGreaterThan(0.7);
      // Hour 14: 0/2 completed BUT low confidence → blended with prior(0.75)
      // Still > 0.5 because Bayesian pulls towards prior
      expect(scores.get(14)?.score).toBeGreaterThan(0.5);
      // Hour 9 should still be higher than hour 14
      expect(scores.get(9)!.score).toBeGreaterThan(scores.get(14)!.score);
    });

    it("should score poorly with enough bad data to overwhelm prior", () => {
      // 10+ tasks all failed → confidence high → observed score dominates
      const completedTasks = Array.from({ length: 12 }, () => ({
        hour: 3,
        completed: false,
        duration: 60,
      }));

      const scores = productivityScorer.calculateHourlyScores(completedTasks);

      // Hour 3: 0/12 completed, confidence ≈ 1 → observed(0.3) dominates prior(0.08)
      expect(scores.get(3)?.score).toBeLessThan(0.4);
    });

    it("should return circadian prior scores for hours with no data", () => {
      const completedTasks: any[] = [];
      const scores = productivityScorer.calculateHourlyScores(completedTasks);

      // No data → Bayesian smoothing returns circadian rhythm prior
      expect(scores.get(9)?.score).toBe(0.9); // prior hour 9
      expect(scores.get(14)?.score).toBe(0.75); // prior hour 14
      expect(scores.get(3)?.score).toBe(0.08); // prior hour 3 (nighttime)
      // Confidence should be 0 with no data
      expect(scores.get(9)?.confidence).toBe(0);
    });

    it("should calculate confidence based on decay-weighted sample size", () => {
      // 12 tasks, all daysAgo=0 → each weight=1.0 → weightedTotal=12
      const completedTasks = Array.from({ length: 12 }, () => ({
        hour: 9,
        completed: true,
        duration: 60,
      }));

      const scores = productivityScorer.calculateHourlyScores(completedTasks);
      const hour9Score = scores.get(9)!;

      // weightedTotal(12) / 8 → capped at 1
      expect(hour9Score.confidence).toBe(1);
      expect(hour9Score.sampleSize).toBe(12);
    });

    it("should weight recent tasks more via exponential decay", () => {
      // All tasks at hour 10:
      //   Recent tasks (daysAgo=0) → all completed
      //   Old tasks (daysAgo=25) → all failed
      const recentGood = Array.from({ length: 5 }, () => ({
        hour: 10,
        completed: true,
        duration: 60,
        daysAgo: 0,
      }));
      const oldBad = Array.from({ length: 5 }, () => ({
        hour: 10,
        completed: false,
        duration: 60,
        daysAgo: 25,
      }));

      const scoreWithDecay = productivityScorer.calculateHourlyScores(
        [...recentGood, ...oldBad],
        30,
      );

      // Recent tasks dominate → score should be high despite old failures
      expect(scoreWithDecay.get(10)!.score).toBeGreaterThan(0.7);

      // Compare: if all tasks were equally recent, score would be lower
      const allRecent = [
        ...Array.from({ length: 5 }, () => ({
          hour: 10,
          completed: true,
          duration: 60,
          daysAgo: 0,
        })),
        ...Array.from({ length: 5 }, () => ({
          hour: 10,
          completed: false,
          duration: 60,
          daysAgo: 0,
        })),
      ];
      const scoreNoDecay = productivityScorer.calculateHourlyScores(
        allRecent,
        30,
      );

      expect(scoreWithDecay.get(10)!.score).toBeGreaterThan(
        scoreNoDecay.get(10)!.score,
      );
    });
  });

  describe("calculateHourlyScoresForDay", () => {
    it("should use day-specific data when enough samples exist", () => {
      // 15 Monday tasks at hour 9 (all completed)
      const mondayTasks = Array.from({ length: 15 }, () => ({
        hour: 9,
        completed: true,
        duration: 60,
        dayOfWeek: 1,
      }));
      // 15 Friday tasks at hour 9 (all failed)
      const fridayTasks = Array.from({ length: 15 }, () => ({
        hour: 9,
        completed: false,
        duration: 60,
        dayOfWeek: 5,
      }));

      const allTasks = [...mondayTasks, ...fridayTasks];

      const mondayScores = productivityScorer.calculateHourlyScoresForDay(
        allTasks,
        1,
        30,
      );
      const fridayScores = productivityScorer.calculateHourlyScoresForDay(
        allTasks,
        5,
        30,
      );

      // Monday (all completed) should score much higher than Friday (all failed)
      expect(mondayScores.get(9)!.score).toBeGreaterThan(
        fridayScores.get(9)!.score,
      );
    });

    it("should blend day-specific with all-days when few day samples", () => {
      // Only 3 Monday tasks (not enough for pure day-specific)
      const mondayTasks = Array.from({ length: 3 }, () => ({
        hour: 9,
        completed: true,
        duration: 60,
        dayOfWeek: 1,
      }));
      // Many other-day tasks
      const otherTasks = Array.from({ length: 20 }, () => ({
        hour: 9,
        completed: false,
        duration: 60,
        dayOfWeek: 3,
      }));

      const scores = productivityScorer.calculateHourlyScoresForDay(
        [...mondayTasks, ...otherTasks],
        1,
        30,
      );

      // Should return a blended result (not purely Monday or all-days)
      expect(scores.get(9)?.score).toBeDefined();
      expect(scores.get(9)!.score).toBeGreaterThan(0);
      expect(scores.get(9)!.score).toBeLessThan(1);
    });
  });

  describe("findOptimalHours", () => {
    it("should return top N hours with highest scores", () => {
      const scores = new Map<number, ProductivityScore>([
        [8, { hour: 8, score: 0.9, confidence: 0.8, sampleSize: 10 }],
        [9, { hour: 9, score: 0.95, confidence: 0.9, sampleSize: 12 }],
        [10, { hour: 10, score: 0.85, confidence: 0.7, sampleSize: 8 }],
        [14, { hour: 14, score: 0.5, confidence: 0.6, sampleSize: 7 }],
      ]);

      const taskProfile: TaskProfile = {
        difficulty: "medium",
        requiresFocus: true,
        estimatedDuration: 120,
      };

      const optimal = productivityScorer.findOptimalHours(
        scores,
        taskProfile,
        2,
      );

      expect(optimal).toHaveLength(2);
      expect(optimal[0].hour).toBe(9);
      expect(optimal[1].hour).toBe(8);
    });

    it("should filter by preferred time of day", () => {
      const scores = new Map<number, ProductivityScore>([
        [8, { hour: 8, score: 0.9, confidence: 0.8, sampleSize: 10 }],
        [9, { hour: 9, score: 0.95, confidence: 0.9, sampleSize: 12 }],
        [14, { hour: 14, score: 0.8, confidence: 0.7, sampleSize: 8 }],
        [15, { hour: 15, score: 0.85, confidence: 0.7, sampleSize: 8 }],
      ]);

      const taskProfile: TaskProfile = {
        difficulty: "medium",
        requiresFocus: false,
        estimatedDuration: 60,
        preferredTimeOfDay: "afternoon",
      };

      const optimal = productivityScorer.findOptimalHours(
        scores,
        taskProfile,
        2,
      );

      expect(
        optimal.every((h: { hour: number }) => h.hour >= 12 && h.hour <= 17),
      ).toBe(true);
    });

    it("should boost hard tasks in high-confidence hours", () => {
      const scores = new Map<number, ProductivityScore>([
        [8, { hour: 8, score: 0.85, confidence: 0.6, sampleSize: 8 }],
        [9, { hour: 9, score: 0.82, confidence: 0.95, sampleSize: 15 }],
      ]);

      const hardTask: TaskProfile = {
        difficulty: "hard",
        requiresFocus: true,
        estimatedDuration: 120,
      };

      const optimal = productivityScorer.findOptimalHours(scores, hardTask, 2);

      expect(optimal[0].hour).toBe(9);
    });
  });

  describe("compareSlots", () => {
    it("should return slot with higher productivity score", () => {
      const slot1 = {
        start: new Date("2024-03-15T09:00:00"),
        end: new Date("2024-03-15T10:00:00"),
        duration: 60,
        productivityScore: 0.9,
      };

      const slot2 = {
        start: new Date("2024-03-15T14:00:00"),
        end: new Date("2024-03-15T15:00:00"),
        duration: 60,
        productivityScore: 0.5,
      };

      const productivityScores = new Map<number, ProductivityScore>([
        [9, { hour: 9, score: 0.9, confidence: 0.8, sampleSize: 10 }],
        [14, { hour: 14, score: 0.5, confidence: 0.6, sampleSize: 7 }],
      ]);

      const taskProfile: TaskProfile = {
        difficulty: "medium",
        requiresFocus: false,
        estimatedDuration: 60,
      };

      const result = productivityScorer.compareSlots(
        slot1,
        slot2,
        taskProfile,
        productivityScores,
      );

      expect(result.better.start.getHours()).toBe(9);
    });
  });

  describe("analyzeTrend", () => {
    it("should detect improving productivity", () => {
      const historicalScores = [
        new Map<number, ProductivityScore>([
          [9, { hour: 9, score: 0.6, confidence: 0.8, sampleSize: 10 }],
        ]),
        new Map<number, ProductivityScore>([
          [9, { hour: 9, score: 0.7, confidence: 0.8, sampleSize: 10 }],
        ]),
        new Map<number, ProductivityScore>([
          [9, { hour: 9, score: 0.8, confidence: 0.8, sampleSize: 10 }],
        ]),
        new Map<number, ProductivityScore>([
          [9, { hour: 9, score: 0.9, confidence: 0.8, sampleSize: 10 }],
        ]),
      ];

      const trend = productivityScorer.analyzeTrend(historicalScores, 3);

      expect(trend.improving).toBe(true);
    });

    it("should identify best and worst hours", () => {
      const historicalScores = [
        new Map<number, ProductivityScore>([
          [9, { hour: 9, score: 0.9, confidence: 0.8, sampleSize: 10 }],
          [14, { hour: 14, score: 0.4, confidence: 0.6, sampleSize: 7 }],
        ]),
      ];

      const trend = productivityScorer.analyzeTrend(historicalScores, 1);

      expect(trend.bestHour).toBe(9);
      expect(trend.worstHour).toBe(14);
    });
  });
});
