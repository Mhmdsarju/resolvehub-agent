/*This ResolveHubClient sends detected alerts from the Docker Agent to the ResolveHub backend webhook. 
It builds the webhook payload with the alert’s status, name, priority, severity, service, log details, and timestamps,
 then sends it to the correct monitoring project using the configured integrationId;
 if the backend rejects the request, it throws an error. */ 

import { AgentConfig } from "../config/AgentConfig";
import { MatchedAlert } from "../rules/AlertRuleEngine";

export interface ResolveHubAlert {
    status: "firing" | "resolved";
    labels: {
        priority: string;
        severity: string;
        alertname: string;
        service: string;
        stream: string;
    };
    startsAt: string;
    endsAt: string;
    annotations: {
        summary: string;
        description: string;
    };
    generatorURL: string;
}

export interface ResolveHubWebhookPayload {
    receiver: "resolvehub";
    status: "firing" | "resolved";
    alerts: ResolveHubAlert[];
}

export class ResolveHubClient {
    private readonly webhookUrl: string;

    constructor() {
        this.webhookUrl =
            `${AgentConfig.resolveHubUrl}/api/monitoring-projects/integrations/${AgentConfig.integrationId}/webhook`;
    }

    async sendAlert(
        matchedAlert: MatchedAlert,
        service: string,
        status: "firing" | "resolved"
    ): Promise<void> {
        const now = new Date().toISOString();

        const payload: ResolveHubWebhookPayload = {
            receiver: "resolvehub",
            status,
            alerts: [
                {
                    status,
                    labels: {
                        priority: matchedAlert.rule.priority,
                        severity: matchedAlert.rule.severity,
                        alertname: matchedAlert.rule.name,
                        service,
                        stream: matchedAlert.log.stream,
                    },
                    startsAt: matchedAlert.log.timestamp,
                    endsAt:
                        status === "resolved"
                            ? now
                            : "0001-01-01T00:00:00Z",
                    annotations: {
                        summary: matchedAlert.rule.summary,
                        description:
                            `${matchedAlert.rule.description} Message: ${matchedAlert.log.message}`,
                    },
                    generatorURL: "resolvehub-agent",
                },
            ],
        };

        const response = await fetch(this.webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();

            throw new Error(
                `ResolveHub webhook failed: ${response.status} ${errorBody}`
            );
        }
    }
}