# BYOM AI — Alert Rules v1

> **Status:** Draft · **Effective from:** 2026-03-23  
> **Owner:** Platform Reliability  
> These rules are expressed as pseudo-PromQL / annotation format; adapt to your
> actual monitoring backend (e.g. Prometheus, Datadog, CloudWatch).

---

## Alert: BYOM_HighRequestFailureRate

```yaml
alert: BYOM_HighRequestFailureRate
expr: |
  (
    rate(byom_request_failure_total[5m])
    /
    rate(byom_request_total[5m])
  ) > 0.01
for: 5m
severity: warning
labels:
  team: platform
  slo: SLO-01
annotations:
  summary: "Request failure rate > 1 % over 5 minutes"
  description: >
    More than 1 % of requests are failing.  Check provider availability,
    network connectivity between bridge and adapters, and auth token validity.
  runbook: ops/runbooks/bridge-unavailable.md
```

---

## Alert: BYOM_CriticalRequestFailureRate

```yaml
alert: BYOM_CriticalRequestFailureRate
expr: |
  (
    rate(byom_request_failure_total[5m])
    /
    rate(byom_request_total[5m])
  ) > 0.05
for: 2m
severity: critical
labels:
  team: platform
  slo: SLO-01
  page: "true"
annotations:
  summary: "Request failure rate > 5 % — SLO breach imminent"
  description: >
    Critical failure rate.  Immediate investigation required.  Check bridge
    process health, adapter crash-loop status, and auth provider availability.
  runbook: ops/runbooks/bridge-unavailable.md
```

---

## Alert: BYOM_HighP95Latency

```yaml
alert: BYOM_HighP95Latency
expr: |
  histogram_quantile(0.95, rate(byom_request_duration_ms_bucket[10m])) > 3000
for: 10m
severity: warning
labels:
  team: platform
  slo: SLO-02
annotations:
  summary: "P95 request latency > 3 000 ms"
  description: >
    P95 end-to-end latency exceeds target.  Check adapter health gauges for
    slow providers and review network path between bridge and adapters.
  runbook: ops/runbooks/adapter-crash-loop.md
```

---

## Alert: BYOM_AdapterDegraded

```yaml
alert: BYOM_AdapterDegraded
expr: |
  min by (providerId) (byom_adapter_health) < 1
for: 2m
severity: warning
labels:
  team: platform
  slo: SLO-04
annotations:
  summary: "Adapter {{ $labels.providerId }} is in a degraded or failed state"
  description: >
    An adapter's health gauge has dropped below 1 for more than 2 minutes.
    Check the adapter host logs and restart count.
  runbook: ops/runbooks/adapter-crash-loop.md
```

---

## Alert: BYOM_AdapterCrashLoop

```yaml
alert: BYOM_AdapterCrashLoop
expr: |
  increase(byom_retry_total[10m]) > 3
for: 0m
severity: critical
labels:
  team: platform
  slo: SLO-04
  page: "true"
annotations:
  summary: "Adapter {{ $labels.providerId }} crash-loop: > 3 restarts in 10 min"
  description: >
    The adapter host has attempted more than 3 restarts in the last 10 minutes.
    The adapter will be marked FAILED after the restart limit is exhausted.
  runbook: ops/runbooks/adapter-crash-loop.md
```

---

## Alert: BYOM_HighStreamInterruptionRate

```yaml
alert: BYOM_HighStreamInterruptionRate
expr: |
  (
    rate(byom_stream_interruption_total[10m])
    /
    (rate(byom_stream_chunk_total[10m]) + rate(byom_stream_interruption_total[10m]))
  ) > 0.005
for: 10m
severity: warning
labels:
  team: platform
  slo: SLO-03
annotations:
  summary: "Stream interruption rate > 0.5 %"
  description: >
    More than 0.5 % of stream sessions are ending without a done event.
    Check network stability between bridge and provider adapters.
  runbook: ops/runbooks/stream-interruption.md
```

---

## Alert: BYOM_AuthFailureSpike

```yaml
alert: BYOM_AuthFailureSpike
expr: |
  (
    rate(byom_request_failure_total{reasonCode=~"auth.*"}[5m])
    /
    rate(byom_request_total[5m])
  ) > 0.02
for: 5m
severity: warning
labels:
  team: platform
  category: auth
annotations:
  summary: "Auth failure rate > 2 % — possible token expiry or invalid credentials"
  description: >
    A disproportionate share of failures are auth-related.  Check provider
    token expiry, credential rotation status, and OAuth2 callback health.
  runbook: ops/runbooks/auth-failure-spike.md
```

---

## Alert: BYOM_BridgeUnavailable

```yaml
alert: BYOM_BridgeUnavailable
expr: |
  absent(byom_request_total) == 1
for: 3m
severity: critical
labels:
  team: platform
  page: "true"
annotations:
  summary: "No byom.request.total metrics for > 3 min — bridge may be down"
  description: >
    The bridge daemon appears to have stopped emitting metrics.  Check
    whether the native messaging host process is running and reachable.
  runbook: ops/runbooks/bridge-unavailable.md
```

---

## Routing and Notification

| Severity | Channel | Response time |
|----------|---------|---------------|
| `critical` (page=true) | PagerDuty on-call rotation | ≤ 5 min |
| `critical` | Slack `#platform-alerts` | ≤ 15 min |
| `warning` | Slack `#platform-alerts` | ≤ 1 h |
| `info` | Dashboard only | Next business day |

---

## References

- SLO definitions: `ops/slo/slo-definitions.md`
- Runbooks: `ops/runbooks/`
