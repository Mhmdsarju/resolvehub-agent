import { MatchedAlert } from "../rules/AlertRuleEngine";
import { ResolveHubClient } from "../webhook/ResolveHubClient";

interface ActiveAlert {
    key: string;
    matchedAlert: MatchedAlert;
    service: string;
    lastSeenAt: number;
}

export class AlertManager {
    private readonly activeAlerts = new Map<string, ActiveAlert>();
    private readonly recoveryWindow = 60000;

    constructor(
        private readonly resolveHubClient: ResolveHubClient
    ) {
        setInterval(() => {
            this.checkForRecovery();
        }, 10000);
    }

    async process(
        matchedAlert: MatchedAlert,
        service: string
    ): Promise<void> {
        const key = this.createAlertKey(matchedAlert, service);

        const existingAlert = this.activeAlerts.get(key);

        if (existingAlert) {
            existingAlert.lastSeenAt = Date.now();
            return;
        }

        this.activeAlerts.set(key, {
            key,
            matchedAlert,
            service,
            lastSeenAt: Date.now(),
        });

        await this.resolveHubClient.sendAlert(
            matchedAlert,
            service,
            "firing"
        );
    }

    async resolve(
        matchedAlert: MatchedAlert,
        service: string
    ): Promise<void> {
        const key = this.createAlertKey(matchedAlert, service);

        const existingAlert = this.activeAlerts.get(key);

        if (!existingAlert) {
            return;
        }

        await this.resolveHubClient.sendAlert(
            existingAlert.matchedAlert,
            service,
            "resolved"
        );

        this.activeAlerts.delete(key);
    }

    private async checkForRecovery(): Promise<void> {
        const now = Date.now();

        for (const alert of this.activeAlerts.values()) {
            if (now - alert.lastSeenAt < this.recoveryWindow) {
                continue;
            }

            await this.resolve(
                alert.matchedAlert,
                alert.service
            );
        }
    }

    private createAlertKey(
        matchedAlert: MatchedAlert,
        service: string
    ): string {
        return `${service}:${matchedAlert.rule.name}`;
    }
}