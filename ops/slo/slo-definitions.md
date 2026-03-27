# Arlopass — SLO Definitions v1

> **Status:** Draft · **Effective from:** 2026-03-23  
> **Owner:** Platform Reliability · **Review cadence:** Quarterly

---

## 1  Scope

These SLOs cover the production request path from the Arlopass web-SDK through the
local bridge daemon to adapter providers.  Measurements are taken from the
bridge's telemetry signals (`arlopass.*` metric namespace).

---

## 2  Service Level Indicators (SLIs)

| ID | Signal | Metric | Window |
|----|--------|--------|--------|
| SLI-01 | Request success rate | `arlopass.request.total` vs `arlopass.request.failure.total` | 30-day rolling |
| SLI-02 | P95 end-to-end latency | `arlopass.request.duration_ms` p95 | 7-day rolling |
| SLI-03 | Stream interruption rate | `arlopass.stream.interruption.total` vs `arlopass.stream.chunk.total` | 7-day rolling |
| SLI-04 | Adapter health availability | `arlopass.adapter.health` gauge (1 = healthy) | 24-h rolling |
| SLI-05 | Mean time to recover (MTTR) | Measured from degraded → running state transitions | Per incident |

---

## 3  Service Level Objectives (SLOs)

### SLO-01 — Request Success Rate

| Target | Error budget (30-day) |
|--------|----------------------|
| ≥ 99.5 % of requests succeed | 216 minutes of allowed failures |

**Measurement:**
```
success_rate = 1 - (sum(arlopass.request.failure.total) / sum(arlopass.request.total))
```

**Labels:** `providerId`, `messageType`, `origin`  
**Excluded:** Requests that fail due to policy denial (expected behaviour).

---

### SLO-02 — P95 End-to-End Latency

| Capability | Target |
|-----------|--------|
| `chat.completions` | P95 ≤ 3 000 ms |
| `chat.stream` first-chunk | P95 ≤ 1 500 ms |
| `session.create` | P95 ≤ 500 ms |
| `provider.list` | P95 ≤ 300 ms |

**Measurement:** `arlopass.request.duration_ms` histogram p95 per capability.

---

### SLO-03 — Stream Interruption Rate

| Target |
|--------|
| ≤ 0.5 % of stream sessions end with an interruption (no `done` event) |

**Measurement:**
```
interruption_rate = sum(arlopass.stream.interruption.total) /
                   (sum(arlopass.stream.interruption.total) + count_of_completed_streams)
```

---

### SLO-04 — Adapter Health Availability

| Target |
|--------|
| `arlopass.adapter.health` gauge ≥ 0.99 over any 24-hour window per registered provider |

**Measurement:** Time-weighted average of `arlopass.adapter.health` gauge value.

---

### SLO-05 — Mean Time to Recover

| Target |
|--------|
| MTTR ≤ 5 minutes from alert trigger to adapter back in RUNNING state |

**Measurement:** Manually recorded from incident timeline; automated where
adapter-host restart telemetry (`arlopass.retry.total`) is available.

---

## 4  Error Budget Policy

| Burn rate | Response |
|-----------|----------|
| > 2× budget consumed in 1 h | Page on-call engineer |
| > 5× budget consumed in 6 h | Escalate to platform lead; freeze non-emergency deploys |
| Budget exhausted | Reliability postmortem required before next release |

---

## 5  Exclusions and Special Cases

- **Auth policy denials** (`arlopass.request.failure.total` where `reasonCode = auth.*`):
  counted separately for SLO-06 (auth spike runbook) and excluded from SLO-01.
- **Planned maintenance windows**: must be declared ≥ 1 h in advance; excluded
  from error budget calculation.
- **Development / staging environments**: SLOs apply to production workspaces only.

---

## 6  References

- Alert rules: `ops/slo/alert-rules.md`
- Runbooks: `ops/runbooks/`
- Telemetry package: `packages/telemetry/`
- Design spec: `docs/superpowers/specs/2026-03-23-reliability-operations-platform-design.md`
