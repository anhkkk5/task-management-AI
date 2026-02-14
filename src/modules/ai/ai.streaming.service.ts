import { Response } from "express";

export const aiStreamingService = {
  initSse: (res: Response): void => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    (res as any).flushHeaders?.();
  },

  sendSseEvent: (res: Response, data: unknown, event?: string): void => {
    if (event) {
      res.write(`event: ${event}\n`);
    }
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  },

  closeSse: (res: Response): void => {
    res.end();
  },
};
