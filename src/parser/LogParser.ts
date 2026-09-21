/* This LogParser converts the raw Docker log stream into structured log 
objects by identifying whether each log came from stdout or stderr,
 extracting the timestamp when available, and separating the actual log message. 
It also uses a buffer to handle Docker log chunks that may arrive partially.*/ 

export type LogStream = "stdout" | "stderr";

export interface ParsedLog {
    timestamp: string;
    stream: LogStream;
    message: string;
}

export class LogParser {
    private buffer = Buffer.alloc(0);

    parse(chunk: Buffer): ParsedLog[] {
        this.buffer = Buffer.concat([this.buffer, chunk]);

        const logs: ParsedLog[] = [];

        while (this.buffer.length >= 8) {
            const streamType = this.buffer[0];

            const payloadLength = this.buffer.readUInt32BE(4);

            if (this.buffer.length < 8 + payloadLength) {
                break;
            }

            const payload = this.buffer.subarray(8, 8 + payloadLength);

            this.buffer = this.buffer.subarray(8 + payloadLength);

            const stream: LogStream =
                streamType === 2 ? "stderr" : "stdout";

            const content = payload.toString("utf8").trim();

            if (!content) {
                continue;
            }

            const timestampMatch = content.match(
                /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?(.*)$/s
            );

            if (timestampMatch) {
                logs.push({
                    timestamp: timestampMatch[1],
                    stream,
                    message: timestampMatch[2].trim(),
                });
            } else {
                logs.push({
                    timestamp: new Date().toISOString(),
                    stream,
                    message: content,
                });
            }
        }

        return logs;
    }
}