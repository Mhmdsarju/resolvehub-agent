# ResolveHub Agent

ResolveHub Agent is a lightweight Docker-based monitoring agent designed to monitor containerized applications and services and automatically report meaningful failures to ResolveHub.

It works as an edge monitoring component between the Docker environment and ResolveHub.

The agent connects directly to the Docker Engine, discovers running containers, collects their stdout and stderr logs, parses the incoming Docker log stream, evaluates logs against predefined alert rules, prevents duplicate alerts, monitors container availability, and sends meaningful firing or resolved alerts to ResolveHub.

The main purpose of ResolveHub Agent is to provide simple monitoring and automatic incident detection for projects that do not have Prometheus, Grafana, or another dedicated monitoring system.

---

## Why ResolveHub Agent?

Traditional monitoring systems often require multiple components and configuration steps.

For example:

```text
Application
    ↓
Metrics Exporter
    ↓
Prometheus
    ↓
Alert Rules
    ↓
Alertmanager
    ↓
ResolveHub
```

This setup is powerful, but it can require additional configuration and infrastructure.

ResolveHub Agent provides a simpler Docker-first approach:

```text
Application Containers
        ↓
ResolveHub Agent
        ↓
ResolveHub
        ↓
Incident
```

The agent performs log processing and basic service health monitoring locally and sends only meaningful alerts to ResolveHub.

---

# How ResolveHub Agent Works

The agent runs as a Docker container and communicates with the Docker Engine through the Docker socket.

Once started, the agent performs two main monitoring operations:

1. Container log monitoring
2. Container availability monitoring

The complete flow is:

```text
                         Docker Environment
                                |
              +-----------------+-----------------+
              |                 |                 |
              v                 v                 v
        Backend API        Worker Service     Other Services
         Container           Container          Container
              |                 |                 |
              +-----------------+-----------------+
                                |
                     stdout / stderr logs
                                |
                                v
                    +----------------------+
                    |   ResolveHub Agent   |
                    +----------------------+
                                |
              +-----------------+-----------------+
              |                 |                 |
              v                 v                 v
        Log Collector      Rule Engine      Health Monitor
              |                 |                 |
              v                 v                 v
        Log Parser        Pattern Match    Container State
              |                 |                 |
              +-----------------+-----------------+
                                |
                                v
                         Alert Manager
                                |
                       Meaningful alerts
                                |
                                v
                       ResolveHub Webhook
                                |
                                v
                         ResolveHub Alert
                                |
                                v
                            Incident
```

The agent does not continuously send all application logs to ResolveHub.

Normal logs remain local.

Only logs that match a predefined alert rule are converted into alerts and sent to ResolveHub.

---

# Architecture

The agent is divided into several logical components.

```text
ResolveHub Agent
│
├── DockerLogCollector
├── LogParser
├── AlertRuleEngine
├── AlertManager
├── DockerContainerMonitor
├── ResolveHubClient
└── AgentConfig
```

Each component has a specific responsibility.

---

# 1. Docker Container Discovery

When the agent starts, it connects to the Docker Engine using the Docker socket.

The Docker socket is mounted into the agent container:

```text
/var/run/docker.sock
```

The agent periodically asks Docker for the currently running containers.

The discovery flow is:

```text
ResolveHub Agent
       |
       v
Docker Engine
       |
       v
List Running Containers
       |
       v
Read Container Information
       |
       v
Register Container
       |
       v
Start Monitoring
```

For every discovered container, the agent identifies the container name and starts monitoring it.

The ResolveHub Agent container itself is excluded from monitoring so that the agent does not continuously monitor its own logs.

---

# 2. Docker Engine Connection

The agent uses the Docker socket to communicate with the Docker Engine.

When running the agent, the Docker socket is mounted using:

```bash
-v /var/run/docker.sock:/var/run/docker.sock:ro
```

The left side represents the Docker socket on the host.

The right side represents the socket location inside the ResolveHub Agent container.

The `:ro` option mounts the socket as read-only.

The connection looks like:

```text
Host Machine
│
├── Docker Engine
│      |
│      | Docker Socket
│      v
│   /var/run/docker.sock
│
└── ResolveHub Agent Container
       |
       └── /var/run/docker.sock
```

Through this connection, the agent can discover containers and access their log streams.

---

# 3. Live Container Log Collection

After discovering a container, the agent starts a live Docker log stream.

The agent listens to:

```text
stdout
stderr
```

For example, an application container may produce:

```text
Server started
Database connected
Request received
Connection refused
Request completed
```

The Docker Engine provides these logs to the agent through the Docker log stream.

The flow is:

```text
Application
     |
     v
stdout / stderr
     |
     v
Docker Engine
     |
     v
Docker Log Stream
     |
     v
DockerLogCollector
```

The collector continuously listens for new log data.

This means the agent does not need to repeatedly execute commands such as:

```bash
docker logs container
```

Instead, it maintains a live stream for the monitored container.

---

# 4. Docker Log Stream Parsing

Docker log streams contain structured information about the stream and payload.

The agent receives the stream as raw data chunks.

The raw data is passed to the `LogParser`.

```text
Docker Log Stream
       |
       v
Raw Buffer
       |
       v
LogParser
       |
       +---- Timestamp
       |
       +---- Stream
       |
       +---- Message
       |
       v
ParsedLog
```

The parser identifies whether the message came from stdout or stderr.

It also extracts the timestamp when the timestamp is available.

The resulting internal representation is:

```json
{
  "timestamp": "2026-09-14T10:31:04.000Z",
  "stream": "stderr",
  "message": "Connection refused"
}
```

The parsed log is then passed to the alert rule engine.

---

# 5. Alert Rule Engine

The `AlertRuleEngine` is responsible for identifying meaningful errors.

The agent contains predefined alert rules.

Each alert rule contains:

```text
Rule Name
Pattern
Priority
Severity
Summary
Description
```

For example:

```text
Rule Name:
Connection Refused

Pattern:
connection refused

Priority:
P2

Severity:
HIGH
```

The rule engine evaluates every parsed log against the predefined rules.

The flow is:

```text
Parsed Log
    |
    v
AlertRuleEngine
    |
    v
Evaluate Rules
    |
    +----------------------+
    |                      |
    v                      v
No Match                Match Found
    |                      |
    v                      v
Ignore Log            Matched Alert
```

If the log does not match any rule, it is ignored.

If the log matches a rule, a `MatchedAlert` is created.

---

# 6. Pattern-Based Error Detection

ResolveHub Agent uses regular expression patterns to identify common application and infrastructure failures.

For example:

```text
Application Log:

Database connection failed
```

The rule engine evaluates the message against the predefined patterns.

If the corresponding rule matches:

```text
Database Connection Failed
```

the agent creates an alert.

Example:

```text
Database connection failed
        |
        v
Rule Engine
        |
        v
Database Connection Failed
        |
        +--> Priority: P1
        |
        +--> Severity: CRITICAL
        |
        v
Matched Alert
```

This allows the agent to detect common failures without requiring every project to manually configure basic error patterns.

---

# 7. Predefined Alert Rules

The agent includes predefined rules for common application and infrastructure problems.

## Critical Errors

```text
Fatal Error
Out Of Memory
Container OOM Killed
Database Connection Failed
Database Unavailable
Service Unavailable
Health Check Failed
Unhandled Error
Critical Error
Disk Space Low
Process Crashed
Container Stopped
Service Crashed
```

## High Priority Errors

```text
Connection Refused
Connection Reset
Connection Timeout
DNS Resolution Failed
Network Unreachable
Authentication Failed
Authorization Failed
Rate Limit Exceeded
API Request Failed
Internal Server Error
Bad Gateway
Gateway Timeout
Exception
Traceback
Application Error
Database Query Failed
Deadlock Detected
Redis Connection Failed
Kafka Connection Failed
Message Queue Failure
File System Error
Permission Denied
Configuration Error
Environment Variable Missing
SSL Error
Memory Leak Warning
Dependency Failure
```

## Medium Priority Errors

```text
Slow Response Time
```

Each rule defines the priority and severity that should be sent to ResolveHub.

---

# 8. Alert Priority and Severity

Every matched alert contains both priority and severity.

Example:

```text
Alert:
Database Connection Failed

Priority:
P1

Severity:
CRITICAL
```

Another example:

```text
Alert:
Connection Timeout

Priority:
P2

Severity:
HIGH
```

These values are included in the alert payload sent to ResolveHub.

This allows ResolveHub to determine how the incident should be handled.

---

# 9. Alert Deduplication

Applications can generate the same error repeatedly.

For example:

```text
Connection refused
Connection refused
Connection refused
Connection refused
Connection refused
```

Without deduplication, this could create multiple incidents for the same problem.

ResolveHub Agent prevents this.

The agent creates an alert identity using:

```text
service + alert rule
```

For example:

```text
olx-backend:Connection Refused
```

When the same alert is detected again:

```text
Existing Alert
      |
      v
Update last-seen time
      |
      v
Do not create another alert
```

Therefore:

```text
100 matching logs
       |
       v
1 active alert
```

This keeps ResolveHub incidents meaningful and prevents alert flooding.

---

# 10. Alert Manager

The `AlertManager` maintains the currently active alerts.

Its responsibilities include:

```text
Active alert tracking
Duplicate prevention
Firing alerts
Recovery handling
Alert resolution
```

When a new alert is detected:

```text
Matched Alert
      |
      v
Alert Manager
      |
      v
Is alert already active?
      |
      +---- Yes ----> Update last seen
      |
      +---- No -----> Create active alert
                          |
                          v
                     Send firing alert
```

---

# 11. Firing Alerts

When an alert is detected for the first time, the agent sends a firing alert to ResolveHub.

Example:

```json
{
  "status": "firing",
  "labels": {
    "priority": "P2",
    "severity": "HIGH",
    "alertname": "Connection Refused",
    "service": "olx-backend",
    "stream": "stderr"
  }
}
```

The alert contains information such as:

```text
Alert name
Priority
Severity
Service
Log stream
Start time
Summary
Description
Original message
```

---

# 12. Container Health Monitoring

Log monitoring cannot detect every failure.

For example, suppose a backend container completely stops:

```bash
docker stop olx-backend
```

After the container stops, there may be no new application log saying:

```text
Container stopped
```

Therefore, ResolveHub Agent has a separate Docker container health monitor.

The health monitor periodically checks the running containers.

```text
Docker Engine
      |
      v
List Running Containers
      |
      v
Compare with Previously Monitored Containers
      |
      v
Container Missing?
      |
      +---- No ----> Continue Monitoring
      |
      +---- Yes ---> Start Failure Timer
```

---

# 13. 10-Second Container Failure Detection

The current health monitor checks Docker container availability periodically.

The configuration uses:

```text
Health check interval:
5 seconds

Failure threshold:
10 seconds
```

If a monitored container disappears and remains unavailable beyond the failure threshold, the agent generates a `Container Stopped` alert.

Example:

```text
olx-backend
     |
     | Running
     v
ResolveHub Agent
     |
     | Container disappears
     v
Health Monitor
     |
     | Container unavailable
     v
10 second threshold
     |
     v
Container Stopped
     |
     +--> Priority: P1
     |
     +--> Severity: CRITICAL
     |
     v
ResolveHub
```

This allows the agent to detect service outages even when there is no application error log.

---

# 14. Container Recovery Detection

The health monitor also detects when a previously missing container becomes available again.

Example:

```text
olx-backend
     |
     v
Container stopped
     |
     v
P1 / CRITICAL firing alert
     |
     v
Container started again
     |
     v
Health monitor detects container
     |
     v
Resolved alert
     |
     v
ResolveHub
```

The recovery alert informs ResolveHub that the monitoring condition has recovered.

---

# 15. Firing and Resolved Alerts

ResolveHub Agent supports two alert states:

```text
firing
resolved
```

### Firing

A problem is currently detected.

```text
status = firing
```

### Resolved

The previously detected monitoring condition has recovered.

```text
status = resolved
```

The same alert identity is used for both states.

---

# 16. ResolveHub Webhook Connection

The agent does not require ResolveHub to connect back to the agent.

Instead, the agent makes an outbound request to ResolveHub.

The connection looks like:

```text
ResolveHub Agent
       |
       | HTTP POST
       v
ResolveHub Webhook
       |
       v
Alert Processing
       |
       v
ResolveHub Alert
```

The webhook endpoint follows this structure:

```text
/api/monitoring-projects/integrations/{integrationId}/webhook
```

The complete URL is constructed using:

```text
RESOLVEHUB_URL
+
integrationId
+
webhook path
```

Example:

```text
https://api.resolvehub.com/api/monitoring-projects/integrations/{integrationId}/webhook
```

---

# 17. Integration ID

Each Resolve Agent integration created in ResolveHub has its own integration ID.

The integration ID tells ResolveHub which monitoring integration and project the incoming alert belongs to.

The agent is configured with:

```env
INTEGRATION_ID=your-integration-id
```

For example:

```env
INTEGRATION_ID=f40e9671-d8a2-45df-8b5a-4dc615d0b745
```

The agent uses this value when constructing the webhook URL.

---

# 18. ResolveHub Alert Payload

The agent sends an Alertmanager-compatible payload.

Example:

```json
{
  "receiver": "resolvehub",
  "status": "firing",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "priority": "P1",
        "severity": "CRITICAL",
        "alertname": "Container Stopped",
        "service": "olx-backend",
        "stream": "stderr"
      },
      "startsAt": "2026-09-14T10:30:00.000Z",
      "endsAt": "0001-01-01T00:00:00Z",
      "annotations": {
        "summary": "Container stopped",
        "description": "A monitored container has been unavailable for more than 10 seconds."
      },
      "generatorURL": "resolvehub-agent"
    }
  ]
}
```

ResolveHub receives this payload through the existing monitoring webhook pipeline.

---

# 19. ResolveHub Alert Processing

Once ResolveHub receives the webhook:

```text
ResolveHub Agent
       |
       v
ResolveHub Webhook
       |
       v
Integration Validation
       |
       v
Alert Rule Matching
       |
       v
Alert Creation
       |
       v
Alert Processing
       |
       v
Incident Creation
```

The agent is responsible for monitoring and alert generation.

ResolveHub is responsible for:

```text
Alert storage
Alert processing
Incident creation
Routing
Team assignment
Task creation
Notifications
Incident management
```

This keeps monitoring and incident management separated.

---

# 20. Incident Creation

When a firing monitoring alert reaches ResolveHub, the alert processing pipeline can create an automated incident.

Example:

```text
Container Stopped
       |
       v
P1 / CRITICAL
       |
       v
ResolveHub Alert
       |
       v
Automated Incident
```

The incident contains information derived from the alert:

```text
Title
Description
Severity
Priority
Monitoring Project
Alert
```

If a routing rule matches the alert, ResolveHub can assign the incident to the configured team.

If no routing rule matches, the incident can remain unassigned rather than being dropped.

---

# 21. Alert Rule and Routing Rule Independence

The agent itself does not depend on a ResolveHub routing rule to detect an error.

The agent detects the problem locally and sends it to ResolveHub.

If ResolveHub has a matching alert rule or routing configuration, it can use that information for additional processing.

If no routing rule exists, the alert can still create an incident.

This means:

```text
No Routing Rule
      |
      v
Alert still reaches ResolveHub
      |
      v
Incident still created
      |
      v
Unassigned Incident
```

The monitoring event is not silently lost.

---

# 22. Email Notification

The ResolveHub Agent itself does not send incident emails.

The responsibility is handled by ResolveHub.

The flow is:

```text
ResolveHub Agent
       |
       v
ResolveHub Webhook
       |
       v
Alert
       |
       v
Incident
       |
       v
HIGH / CRITICAL
       |
       v
Kafka Email Event
       |
       v
Email Service
       |
       v
Organization Admin
```

The current ResolveHub flow sends incident-created email notifications for HIGH and CRITICAL incidents.

This keeps notification delivery inside ResolveHub instead of adding email infrastructure to every agent installation.

---

# 23. Alert Recovery vs Incident Closure

A resolved alert does not automatically close the incident.

These are two different concepts.

### Alert Resolution

Means:

```text
Monitoring condition is no longer detected
```

### Incident Closure

Means:

```text
Engineer verified the issue and completed the required resolution
```

The flow is therefore:

```text
Alert Firing
      |
      v
Incident Created
      |
      v
Engineer Investigates
      |
      v
Alert Resolved
      |
      v
Incident Still Open
      |
      v
Engineer Verifies Fix
      |
      v
Incident Manually Closed
```

This prevents monitoring recovery from incorrectly marking an engineering incident as fully resolved.

---

# 24. Example: Application Error

Suppose the application produces:

```text
Database connection failed
```

The complete flow is:

```text
Application
     |
     v
Docker Container
     |
     v
stderr
     |
     v
Docker Engine
     |
     v
DockerLogCollector
     |
     v
LogParser
     |
     v
ParsedLog
     |
     v
AlertRuleEngine
     |
     v
Database Connection Failed
     |
     +--> P1
     |
     +--> CRITICAL
     |
     v
AlertManager
     |
     v
ResolveHubClient
     |
     | HTTP POST
     v
ResolveHub Webhook
     |
     v
ResolveHub Alert
     |
     v
Incident
```

---

# 25. Example: Repeated Application Error

Suppose the application produces the same error repeatedly:

```text
Connection refused
Connection refused
Connection refused
Connection refused
Connection refused
```

The agent processes them like this:

```text
First Error
    |
    v
Create Alert
    |
    v
Send Firing Alert
```

The next errors are recognized as the same active alert.

Therefore:

```text
Repeated Error
      |
      v
Existing Active Alert
      |
      v
Update Last Seen
      |
      v
No Duplicate Alert
```

This prevents incident flooding.

---

# 26. Example: Container Failure

Suppose:

```text
olx-backend
```

is running.

The ResolveHub Agent is monitoring it.

The container is stopped:

```bash
docker stop olx-backend
```

The flow becomes:

```text
Docker Engine
      |
      v
olx-backend disappears
      |
      v
Health Monitor
      |
      v
Container unavailable
      |
      v
10 second threshold
      |
      v
Container Stopped
      |
      +--> P1
      |
      +--> CRITICAL
      |
      v
Alert Manager
      |
      v
ResolveHub Webhook
      |
      v
ResolveHub Alert
      |
      v
Incident Created
```

When the container starts again:

```bash
docker start olx-backend
```

the agent detects the recovery:

```text
Container Available
      |
      v
Health Monitor
      |
      v
Recovery Detected
      |
      v
Resolved Alert
      |
      v
ResolveHub
```

The incident remains open for manual engineering closure.

---

# Configuration

The agent requires two environment variables.

```env
RESOLVEHUB_URL=https://your-resolvehub-api.com
INTEGRATION_ID=your-integration-id
```

## RESOLVEHUB_URL

The base URL of the ResolveHub API.

Production example:

```env
RESOLVEHUB_URL=https://api.resolvehub.com
```

Local development example:

```env
RESOLVEHUB_URL=http://host.docker.internal:5555
```

## INTEGRATION_ID

The Resolve Agent integration ID generated by ResolveHub.

Example:

```env
INTEGRATION_ID=f40e9671-d8a2-45df-8b5a-4dc615d0b745
```

---

# Requirements

The agent requires:

- Docker
- Docker Engine access
- Docker socket access
- A ResolveHub monitoring project
- A ResolveHub Resolve Agent integration
- Network access from the agent to the ResolveHub API

---

# Installation

The recommended installation method is Docker.

Run:

```bash
docker run --rm   --name resolvehub-agent   -v /var/run/docker.sock:/var/run/docker.sock:ro   -e RESOLVEHUB_URL="https://your-resolvehub-api.com"   -e INTEGRATION_ID="your-integration-id"   mhmdsarju/resolvehub-agent:latest
```

For local ResolveHub development:

```bash
docker run --rm   --name resolvehub-agent   -v /var/run/docker.sock:/var/run/docker.sock:ro   -e RESOLVEHUB_URL="http://host.docker.internal:5555"   -e INTEGRATION_ID="your-integration-id"   mhmdsarju/resolvehub-agent:latest
```

---

# Running the Agent

After starting the agent, the console should display:

```text
Resolve Agent started
Docker log monitoring started
Docker container health monitoring started
```

The agent then automatically starts discovering Docker containers and monitoring their logs and availability.

---

# Testing Error Detection

You can test application error detection by running a container that produces a predefined error.

Example:

```bash
docker run --rm   --name test-error-service   alpine sh -c 'echo "Connection refused"; sleep 10'
```

The agent should detect the matching rule and send an alert to ResolveHub.

---

# Testing Container Failure Detection

Start a monitored container:

```bash
docker run -d   --name test-backend   -p 5005:5005   your-backend-image
```

Verify:

```bash
docker ps
```

Then stop the container:

```bash
docker stop test-backend
```

The ResolveHub Agent should detect that the container is no longer running.

After the configured failure threshold, a `Container Stopped` alert should be generated.

---

# Testing Recovery

Start the container again:

```bash
docker start test-backend
```

The agent detects that the container is available again and sends a resolved alert.

You can verify the agent logs:

```bash
docker logs resolvehub-agent
```

---

# Development

Install dependencies:

```bash
npm install
```

Run the agent in development mode:

```bash
npm run dev
```

Build the project:

```bash
npm run build
```

Run the compiled application:

```bash
npm start
```

---

# Docker Image

The published image is:

```text
mhmdsarju/resolvehub-agent:latest
```

Build the image locally:

```bash
docker build -t resolvehub-agent:latest .
```

Run the local image:

```bash
docker run --rm   --name resolvehub-agent   -v /var/run/docker.sock:/var/run/docker.sock:ro   -e RESOLVEHUB_URL="http://host.docker.internal:5555"   -e INTEGRATION_ID="your-integration-id"   resolvehub-agent:latest
```

---

# Troubleshooting

## Agent cannot connect to Docker

Verify that the Docker socket is mounted:

```bash
-v /var/run/docker.sock:/var/run/docker.sock:ro
```

Also verify that Docker is running.

## Agent cannot discover containers

Check:

```bash
docker ps
```

Then check the agent logs:

```bash
docker logs resolvehub-agent
```

Make sure the agent has access to the Docker socket.

## Agent cannot send alerts to ResolveHub

Verify:

```env
RESOLVEHUB_URL
INTEGRATION_ID
```

Make sure the ResolveHub API is reachable from the agent container.

## Alerts are not being detected

Verify that:

- The application container is running
- The agent is running
- Docker socket access is available
- The application is producing logs
- The log message matches a predefined rule

Check:

```bash
docker logs resolvehub-agent
```

## Container stopped alert is not generated

Verify that:

- ResolveHub Agent is running continuously
- Docker socket is mounted
- The monitored container was previously discovered
- The container remains unavailable beyond the configured failure threshold

---

# Security

The agent requires Docker Engine access through:

```text
/var/run/docker.sock
```

Docker socket access provides significant access to the Docker environment and should therefore be handled carefully.

The recommended configuration mounts the socket as read-only:

```text
/var/run/docker.sock:/var/run/docker.sock:ro
```

Production ResolveHub connections should use HTTPS:

```env
RESOLVEHUB_URL=https://api.resolvehub.com
```

Never commit `.env` files or credentials to source control.

---

# Data Flow

ResolveHub Agent processes monitoring data locally.

The normal flow is:

```text
Application Log
      |
      v
Docker Engine
      |
      v
ResolveHub Agent
      |
      v
Log Parser
      |
      v
Rule Engine
      |
      +---- No Match ----> Ignore
      |
      +---- Match
              |
              v
         Alert Manager
              |
              v
        ResolveHub Webhook
```

This means normal logs do not need to be transmitted to ResolveHub.

Only meaningful matched alerts are sent.

---

# Complete End-to-End Flow

```text
                    Application
                         |
                         v
                  Docker Container
                         |
             +-----------+-----------+
             |                       |
             v                       v
          stdout                   stderr
             |                       |
             +-----------+-----------+
                         |
                         v
                   Docker Engine
                         |
                         v
                ResolveHub Agent
                         |
            +------------+------------+
            |                         |
            v                         v
      DockerLogCollector       DockerContainerMonitor
            |                         |
            v                         |
        LogParser                     |
            |                         |
            v                         |
     AlertRuleEngine                  |
            |                         |
            +------------+------------+
                         |
                         v
                   AlertManager
                         |
              +----------+----------+
              |                     |
              v                     v
           Firing                Resolved
              |                     |
              +----------+----------+
                         |
                         v
                 ResolveHubClient
                         |
                         | HTTP POST
                         v
                ResolveHub Webhook
                         |
                         v
                  Alert Processing
                         |
                         v
                      Incident
                         |
             +-----------+-----------+
             |                       |
             v                       v
       Routing / Team          Notifications
             |                       |
             v                       v
        Engineering             Email
        Investigation
             |
             v
       Manual Resolution
```

---

# Monitoring Philosophy

ResolveHub Agent follows a simple principle:

```text
Collect locally
     ↓
Process locally
     ↓
Detect meaningful problems
     ↓
Send only actionable alerts
     ↓
Let ResolveHub manage incidents
```

The agent is not intended to replace a full observability platform.

Instead, it provides a lightweight monitoring layer for projects that need practical application error detection and Docker service health monitoring without introducing a large monitoring stack.

---

# Current Scope

The current version focuses on Docker-based workloads.

Supported:

- Docker container discovery
- Docker stdout monitoring
- Docker stderr monitoring
- Live log collection
- Docker log parsing
- Predefined error detection
- Alert priority detection
- Alert severity detection
- Duplicate alert prevention
- Firing alerts
- Resolved alerts
- Container availability monitoring
- Container stopped detection
- Automatic alert recovery
- ResolveHub webhook integration

---

# Future Scope

The architecture can be extended to support additional monitoring sources.

Potential future capabilities include:

- Host process monitoring
- Local file log monitoring
- systemd service monitoring
- HTTP health endpoint monitoring
- Custom application health checks
- Custom alert rules
- Configurable monitoring thresholds
- Additional infrastructure integrations
- Advanced service dependency monitoring

---

# Summary

ResolveHub Agent provides a simple monitoring path for Docker-based applications:

```text
Docker Applications
        ↓
ResolveHub Agent
        ↓
Log & Health Monitoring
        ↓
Error Detection
        ↓
Alert Deduplication
        ↓
Firing / Recovery
        ↓
ResolveHub
        ↓
Incident
        ↓
Engineering Resolution
```

By processing logs and container health locally, the agent reduces unnecessary data transfer while providing automatic detection of important application and infrastructure failures.

ResolveHub Agent bridges the gap between a user's Docker environment and ResolveHub's incident management platform.
