/*This DockerLogCollector discovers running Docker containers,
 continuously streams their stdout and stderr logs, parses those logs using LogParser,
  and passes each parsed log to the logHandler for further alert processing. 
  It also checks for new containers every 5 seconds and ignores 
  the ResolveHub agent container itself.*/

import Docker from "dockerode";
import { LogParser, ParsedLog } from "../parser/LogParser";

export interface DockerLogHandler {
    (service: string, log: ParsedLog): Promise<void>;
}

export class DockerLogCollector {
    private readonly docker: Docker;
    private readonly monitoredContainers = new Set<string>();

    constructor(
        private readonly logHandler: DockerLogHandler
    ) {
        this.docker = new Docker();
    }

    async start(): Promise<void> {
        await this.discoverContainers();

        setInterval(async () => {
            await this.discoverContainers();
        }, 5000);
    }

    private async discoverContainers(): Promise<void> {
        try {
            const containers = await this.docker.listContainers();

            for (const containerInfo of containers) {
                if (
                    containerInfo.Names[0]?.replace("/", "") === "resolvehub-agent"
                ) {
                    continue;
                }

                if (this.monitoredContainers.has(containerInfo.Id)) {
                    continue;
                }

                const service =
                    containerInfo.Names[0]?.replace("/", "") ||
                    containerInfo.Id;

                this.monitoredContainers.add(containerInfo.Id);

                this.startContainerStream(
                    containerInfo.Id,
                    service
                );
            }
        } catch (error) {
            console.error("Failed to discover Docker containers:", error);
        }
    }

    private async startContainerStream(
        containerId: string,
        service: string
    ): Promise<void> {
        try {
            const container = this.docker.getContainer(containerId);
            const parser = new LogParser();

            const logs = await container.logs({
                stdout: true,
                stderr: true,
                timestamps: true,
                follow: true,
                tail: 0,
            });

            logs.on("data", async (chunk: Buffer) => {
                const parsedLogs = parser.parse(chunk);

                for (const log of parsedLogs) {
                    try {
                        await this.logHandler(service, log);
                    } catch (error) {
                        console.error(
                            `Failed to process log from ${service}:`,
                            error
                        );
                    }
                }
            });

            logs.on("error", (error) => {
                console.error(
                    `Docker log stream error for ${service}:`,
                    error
                );
            });

            logs.on("end", () => {
                this.monitoredContainers.delete(containerId);
                console.log(
                    `Docker log stream ended for ${service}`
                );
            });
        } catch (error) {
            this.monitoredContainers.delete(containerId);

            console.error(
                `Failed to start Docker log stream for ${service}:`,
                error
            );
        }
    }
}