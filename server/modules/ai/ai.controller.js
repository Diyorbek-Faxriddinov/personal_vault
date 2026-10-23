import { translate } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { aiService } from "./ai.service.js";

export const aiController = {
    status(_req, res) {
        res.json(aiService.status());
    },

    /**
     * Server-Sent Events: { type: "text", text } ... { type: "done" } | { type: "refusal" } | { type: "error" }
     */
    async chat(req, res) {
        const abort = new AbortController();
        const stream = aiService.stream(req.valid.body, { signal: abort.signal });

        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        });
        const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

        // Foydalanuvchi sahifani yopsa yoki "To'xtatish"ni bossa — API so'rovini ham to'xtatamiz
        res.on("close", () => {
            if (!res.writableEnded) abort.abort();
        });

        stream.on("text", (text) => send({ type: "text", text }));

        try {
            const message = await stream.finalMessage();
            if (message.stop_reason === "refusal") {
                send({ type: "refusal", message: translate(req.lang, "ai.refusal") });
            }
            send({ type: "done", stopReason: message.stop_reason });
        } catch (error) {
            if (abort.signal.aborted) return;
            logger.warn(`AI xatosi: ${error.message}`);
            send({ type: "error", message: aiService.describeError(error, req.lang) });
        }
        res.end();
    },
};
