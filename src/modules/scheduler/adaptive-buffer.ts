/**
 * Adaptive Buffer Calculator
 * Pomodoro-inspired graduated buffer with cumulative fatigue support.
 *
 * Levels:
 *   < 25 min  →  5 min  (micro break)
 *  25-50 min  → 10 min  (short break)
 *  50-90 min  → 15 min  (standard break)
 *   > 90 min  → 20 min  (long break, mental reset)
 *
 * Fatigue bonus: +5 min after every 3 consecutive sessions.
 */

export class AdaptiveBufferCalculator {
  /**
   * Tính buffer time dựa trên duration của session vừa kết thúc.
   *
   * @param sessionDuration Duration của session (phút)
   * @param _defaultBuffer Kept for backward compat (ignored in new logic)
   * @param consecutiveSessions Số session liên tiếp đã hoàn thành (dùng cho fatigue bonus)
   * @returns Buffer time (phút)
   */
  static calculateBuffer(
    sessionDuration: number,
    _defaultBuffer: number = 15,
    consecutiveSessions: number = 0,
  ): number {
    // Graduated base buffer
    let base: number;
    if (sessionDuration < 25) {
      base = 5; // micro break
    } else if (sessionDuration < 50) {
      base = 10; // short break
    } else if (sessionDuration <= 90) {
      base = 15; // standard break
    } else {
      base = 20; // long break — mental reset needed
    }

    // Cumulative fatigue: +5 min every 3 consecutive sessions
    const fatigueBonus =
      consecutiveSessions >= 3 ? Math.floor(consecutiveSessions / 3) * 5 : 0;

    // Cap total buffer at 30 min to avoid excessive gaps
    return Math.min(base + fatigueBonus, 30);
  }

  /**
   * Kiểm tra xem có nên áp dụng buffer không
   * (Không áp dụng buffer cho task đầu tiên trong ngày)
   */
  static shouldApplyBuffer(isFirstTask: boolean): boolean {
    return !isFirstTask;
  }
}
