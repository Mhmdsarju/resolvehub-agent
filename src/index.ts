import { DockerLogCollector } from "./collector/DockerLogCollector";
import { AlertManager } from "./alerts/AlertManager";
import { AlertRuleEngine } from "./rules/AlertRuleEngine";
import { ResolveHubClient } from "./webhook/ResolveHubClient";
import { DockerContainerMonitor } from "./monitor/DockerContainerMonitor";

const resolveHubClient = new ResolveHubClient();
const alertManager = new AlertManager(resolveHubClient);
const alertRuleEngine = new AlertRuleEngine();

const dockerLogCollector = new DockerLogCollector(
    async (service, log) => {
        const matchedAlert = alertRuleEngine.evaluate(log);

        if (!matchedAlert) {
            return;
        }

        await alertManager.process(
            matchedAlert,
            service
        );
    }
);

const dockerContainerMonitor = new DockerContainerMonitor(
    async (matchedAlert, service, status) => {
        if (status === "firing") {
            await alertManager.process(
                matchedAlert,
                service
            );

            return;
        }

        await alertManager.resolve(
            matchedAlert,
            service
        );
    }
);

async function startAgent(): Promise<void> {
    console.log("Resolve Agent started");
    console.log("Docker log monitoring started");
    console.log("Docker container health monitoring started");

    await dockerLogCollector.start();
    await dockerContainerMonitor.start();
}

startAgent().catch((error) => {
    console.error("Resolve Agent failed to start:", error);
    process.exit(1);
});