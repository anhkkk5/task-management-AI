export class UpdateBuilder {
  static buildUpdateObject<T extends Record<string, any>>(
    update: T,
  ): Partial<T> {
    const result: Partial<T> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        result[key as keyof T] = value;
      }
    }

    return result;
  }

  static buildMongoUpdate<T extends Record<string, any>>(
    update: T,
  ): { $set: Partial<T> } {
    const setFields = this.buildUpdateObject(update);
    return { $set: setFields };
  }
}
