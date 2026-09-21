import Docker from "dockerode";

/*This DockerContainerMonitor monitors running Docker containers every 5 seconds.
 If a monitored container disappears, it waits for 2 minutes before triggering a "Container Stopped" firing alert.
  When the container becomes available again, it automatically sends a "resolved" alert.
 It also ignores the resolvehub-agent container itself. */

import { MatchedAlert } from "../rules/AlertRuleEngine";
import { AlertRule, defaultRules } from "../rules/defaultRules";

export interface ContainerHealthHandler {
    (
        matchedAlert: MatchedAlert,
        service: string,
        status: "firing" | "resolved"
    ): Promise<void>;
}

export class DockerContainerMonitor {
    private readonly docker: Docker;
    private readonly monitoredContainers = new Map<
        string,
        {
            containerId: string;
            lastSeenAt: number;
            alerted: boolean;
        }
    >();

    private readonly checkInterval = 5000;
    private readonly failureThreshold = 120000;

    constructor(
        private readonly healthHandler: ContainerHealthHandler
    ) {
        this.docker = new Docker();
    }

    async start(): Promise<void> {
        await this.checkContainers();

        setInterval(async () => {
            await this.checkContainers();
        }, this.checkInterval);
    }

    private async checkContainers(): Promise<void> {
        try {
            const containers = await this.docker.listContainers();

            const currentServices = new Set<string>();

            for (const containerInfo of containers) {
                const service =
                    containerInfo.Names[0]?.replace("/", "") ||
                    containerInfo.Id;

                if (service === "resolvehub-agent") {
                    continue;
                }

                currentServices.add(service);

                const existingContainer =
                    this.monitoredContainers.get(service);

                if (!existingContainer) {
                    this.monitoredContainers.set(service, {
                        containerId: containerInfo.Id,
                        lastSeenAt: Date.now(),
                        alerted: false,
                    });

                    continue;
                }

                existingContainer.containerId = containerInfo.Id;
                existingContainer.lastSeenAt = Date.now();

                if (existingContainer.alerted) {
                    existingContainer.alerted = false;

                    await this.healthHandler(
                        this.createContainerStoppedAlert(),
                        service,
                        "resolved"
                    );
                }
            }

            await this.checkMissingContainers(currentServices);
        } catch (error) {
            console.error(
                "Failed to monitor Docker containers:",
                error
            );
        }
    }

    private async checkMissingContainers(
        currentServices: Set<string>
    ): Promise<void> {
        const now = Date.now();

        for (const [
            service,
            container,
        ] of this.monitoredContainers.entries()) {
            if (currentServices.has(service)) {
                continue;
            }

            if (container.alerted) {
                continue;
            }

            if (now - container.lastSeenAt < this.failureThreshold) {
                continue;
            }

            container.alerted = true;

            await this.healthHandler(
                this.createContainerStoppedAlert(),
                service,
                "firing"
            );
        }
    }

    private createContainerStoppedAlert(): MatchedAlert {
        const rule = defaultRules.find(
            (rule) => rule.name === "Container Stopped"
        ) as AlertRule;

        return {
            rule,
            log: {
                timestamp: new Date().toISOString(),
                stream: "stderr",
                message:
                    "Monitored container has been unavailable for more than 10 seconds.",
            },
        };
    }
}