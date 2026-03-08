# Pagermon Ingest Service

Consolidated SDR message ingestion service for Pagermon. Combines RTL-FM, Multimon-NG, and message queue processing in a single container.

## Features

- Unified single-container design - RTL-FM + Multimon-NG + Worker in one process
- Queue-based message processing with BullMQ and Redis
- Automatic health checks and recovery after API failures
- Circuit breaker pattern to prevent cascading failures
- Dead Letter Queue (DLQ) for permanent failures
- Structured logging with distinct prefixes for debugging

## Architecture

The ingest service is organized into domain modules:

```
ingest/
├── index.js              # Main entry point
├── lib/
│   ├── config.js         # Configuration management
│   ├── circuitBreaker.js # Circuit breaker utility
│   ├── message/          # Message domain
│   │   ├── index.js      # Message domain facade
│   │   ├── model.js      # Normalization & validation
│   │   └── parser.js     # Protocol parsing (POCSAG, FLEX)
│   └── runtime/          # Runtime components
│       ├── index.js      # Runtime domain facade
│       ├── agent.js      # SDR process management
│       ├── queue.js      # BullMQ message queue
│       ├── worker.js     # Queue consumer & API client
│       └── health.js     # API health monitoring
└── package.json
```

**Message Domain** (`lib/message/`):

- Parses multimon-ng JSON output
- Normalizes format field (alpha/numeric)
- Validates message structure before queueing

**Runtime Domain** (`lib/runtime/`):

- Agent spawns and pipes RTL-FM → Multimon-NG
- Queue manages BullMQ message processing
- Worker consumes queue and POSTs to API
- Health monitors API availability and triggers recovery

## Configuration

### Required Environment Variables

```bash
# SDR Configuration
INGEST__FREQUENCIES=163000000        # Receive frequency
INGEST__PROTOCOLS=POCSAG512          # Protocols to decode

# PagerMon API
INGEST__API_URL=http://pagermon:3000 # API endpoint
INGEST__API_KEY=your_key_here        # API authentication key
```

### Optional Environment Variables

```bash
# RTL-SDR tuning
INGEST__GAIN=30                      # Receiver gain (0-49.6)
INGEST__SQUELCH=2.5                  # Squelch level in dB
INGEST__PPM=0                        # Frequency accuracy correction

# Additional options
INGEST__CHARSET=UTF-8                # Character encoding
INGEST__FORMAT=alpha                 # Output format
INGEST__DEVICE=0                     # RTL-SDR device index
INGEST__LABEL=sdr-ingest-1           # Agent label

# Redis
INGEST__REDIS_URL=redis://redis:6379 # Redis connection URL

# Advanced features
INGEST__ENABLE_DLQ=true              # Enable Dead Letter Queue
INGEST__CIRCUIT_BREAKER_THRESHOLD=5  # Failures before opening circuit
INGEST__CIRCUIT_BREAKER_TIMEOUT=30000 # Recovery attempt timeout (ms)
```

## Quick Start

```bash
# Development with Docker Compose
docker compose -f compose.override.yml up --build

# Copy and configure environment
cp .env.example .env
# ... edit .env with your values

# Production
docker compose up
```

## Logging

Structured logging with prefixes:

- `[MAIN]` - Main service operations
- `[AGENT]` - RTL-FM / Multimon-NG activities
- `[WORKER]` - Message processing
- `[QUEUE]` - Queue operations
- `[HEALTH]` - Health check results
- `[CIRCUIT_BREAKER]` - Circuit breaker state transitions
- `[RECOVERY]` - Failed job recovery
- `[DLQ]` - Dead Letter Queue operations

## Error Handling

**Transient Errors** (network, timeout):

- Automatic retry by BullMQ
- Up to 10 attempts with exponential backoff
- Circuit breaker stops attempts after too many failures

**Permanent Errors** (auth, validation):

- No retries
- Optionally moved to Dead Letter Queue
- Available for manual analysis

## Queue Recovery

After successful API reconnection:

1. Health check detects API is available
2. Circuit breaker transitions to HALF_OPEN
3. All failed jobs are retried
4. Upon success: Circuit breaker closes

## Dead Letter Queue

When enabled, permanently failed messages are moved to `sdr-messages-dlq` queue:

```json
{
  "originalJobId": "12345",
  "message": { ... },
  "error": "HTTP 401 Unauthorized",
  "timestamp": "2024-03-08T10:30:45.123Z",
  "attempts": 10
}
```

## Troubleshooting

### Service fails to start

- Check `INGEST__FREQUENCIES` and `INGEST__PROTOCOLS` are set
- Verify `INGEST__API_KEY` is correct
- Confirm Redis is available at `INGEST__REDIS_URL`

### Messages not being processed

- Check health of PagerMon API
- Verify `INGEST__API_URL` is correct and reachable
- Review logs for permanent errors

### Failed messages

- Check Dead Letter Queue if enabled
- Review logs for error details
- Check circuit breaker status

## Development

### With Docker Compose (development)

```bash
docker compose -f compose.override.yml up --build
```

### Local Node

```bash
npm install
node index.js  # INGEST__* environment variables required
```

## Message Format Semantics

The ingest service forwards a normalized `format` field to PagerMon API using multimon-ng terminology:

- `alpha` for alphanumeric payloads (`Alpha:` / `ALN`)
- `numeric` for numeric or generic payloads (`Numeric:` / `NUM` / `GPN`)

Behavior:

- `alpha` requires a non-empty `message`
- `numeric` allows an empty `message` and forwards it as an empty string
