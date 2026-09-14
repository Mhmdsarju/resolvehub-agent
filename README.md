# ResolveHub Agent

ResolveHub Agent is a lightweight Docker monitoring agent that collects container logs, detects predefined application and infrastructure errors, and sends meaningful alerts to ResolveHub.

## Features

- Docker container discovery
- Live container log collection
- Docker log parsing
- Predefined error detection
- Alert priority and severity detection
- Duplicate alert prevention
- Firing and resolved alert support
- ResolveHub webhook integration

## Requirements

- Docker
- Docker Engine access
- A ResolveHub monitoring project
- A ResolveHub Resolve Agent integration

## Configuration

The agent requires the following environment variables:

```env
RESOLVEHUB_URL=https://your-resolvehub-api.com
INTEGRATION_ID=your-integration-id