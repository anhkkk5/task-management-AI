import { productivityScorer } from "../productivity.service";
import { ProductivityScore, TaskProfile } from "../types";

describe("ProductivityScorer", () => {
  describe("calculateHourlyScores", () => {
    it("should calculate scores based on completion rate", () => {
      const completedTasks = [
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: false, duration: 30 },
        { hour: 14, completed: false, duration: 60 },
        { hour: 14, completed: false, duration: 60 },
      ];

      const scores = productivityScorer.calculateHourlyScores(completedTasks);

      // Hour 9: 2/3 completed = ~0.67 completion rate
      expect(scores.get(9)?.score).toBeGreaterThan(0.5);
      // Hour 14: 0/2 completed = low score
      expect(scores.get(14)?.score).toBeLessThan(0.5);
    });

    it("should return default scores for hours with no data", () => {
      const completedTasks: any[] = [];
      const scores = productivityScorer.calculateHourlyScores(completedTasks);

      // All hours should have default score of 0.5
      expect(scores.get(9)?.score).toBe(0.5);
      expect(scores.get(14)?.score).toBe(0.5);
    });

    it("should calculate confidence based on sample size", () => {
      const completedTasks = [
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
        { hour: 9, completed: true, duration: 60 },
      ];

      const scores = productivityScorer.calculateHourlyScores(completedTasks);
      const hour9Score = scores.get(9)!;

      // 12 samples > 10, so confidence should be 1
      expect(hour9Score.confidence).toBe(1);
      expect(hour9Score.sampleSize).toBe(12);
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
      expect(optimal[0].hour).toBe(9); // Highest score
      expect(optimal[1].hour).toBe(8); // Second highest
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

      // Should only return afternoon hours (14, 15)
      expect(
        optimal.every((h: { hour: number }) => h.hour >= 12 && h.hour <= 17),
      ).toBe(true);
    });

    it("should boost hard tasks in high-confidence hours", () => {
      const scores = new Map<number, ProductivityScore>([
        [8, { hour: 8, score: 0.9, confidence: 0.8, sampleSize: 10 }],
        [9, { hour: 9, score: 0.85, confidence: 0.95, sampleSize: 15 }],
      ]);

      const hardTask: TaskProfile = {
        difficulty: "hard",
        requiresFocus: true,
        estimatedDuration: 120,
      };

      const optimal = productivityScorer.findOptimalHours(scores, hardTask, 2);

      // Hour 9 has higher confidence, should be boosted for hard tasks
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
