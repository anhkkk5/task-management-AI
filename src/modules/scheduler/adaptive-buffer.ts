/**
 * Adaptive Buffer Calculator
 * Tính buffer time linh hoạt dựa trên duration của session
 */

export class AdaptiveBufferCalculator {
  /**
   * Tính buffer time dựa trên duration của session vừa kết thúc
   *
   * Quy tắc:
   * - Session < 40 phút → buffer 10 phút (nghỉ ngắn)
   * - Session ≥ 40 phút → buffer 15 phút (nghỉ dài hơn)
   *
   * @param sessionDuration Duration của session (phút)
   * @param defaultBuffer Buffer mặc định nếu không áp dụng quy tắc (phút)
   * @returns Buffer time (phút)
   */
  static calculateBuffer(
    sessionDuration: number,
    defaultBuffer: number = 15,
  ): number {
    if (sessionDuration < 40) {
      return 10; // Session ngắn → nghỉ 10 phút
    }
    return defaultBuffer; // Session dài → nghỉ 15 phút (hoặc theo config)
  }

  /**
   * Kiểm tra xem có nên áp dụng buffer không
   * (Không áp dụng buffer cho task đầu tiên trong ngày)
   */
  static shouldApplyBuffer(isFirstTask: boolean): boolean {
    return !isFirstTask;
  }
}
