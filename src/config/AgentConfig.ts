const resolveHubUrl = process.env.RESOLVEHUB_URL;
const integrationId = process.env.INTEGRATION_ID;

if (!resolveHubUrl) {
    throw new Error("RESOLVEHUB_URL is required");
}

if (!integrationId) {
    throw new Error("INTEGRATION_ID is required");
}

export const AgentConfig = {
    resolveHubUrl,
    integrationId,
};