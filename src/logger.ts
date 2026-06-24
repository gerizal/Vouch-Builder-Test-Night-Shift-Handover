import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export function createHandoverLogger(hotelId: string, shiftDate: string) {
  return logger.child({ hotelId, shiftDate });
}

export default logger;
