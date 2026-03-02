"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiStreamingService = void 0;
exports.aiStreamingService = {
    initSse: (res) => {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();
    },
    sendSseEvent: (res, data, event) => {
        if (event) {
            res.write(`event: ${event}\n`);
        }
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    closeSse: (res) => {
        res.end();
    },
};
