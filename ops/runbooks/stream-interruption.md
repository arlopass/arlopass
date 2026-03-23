# Runbook: Stream Interruption Surge

**Alert:** `BYOM_HighStreamInterruptionRate`  
**SLO:** SLO-03 (Stream interruption rate)  
**Severity:** Warning  
**Owner:** Platform Reliability

---

## 1  Detection Signals

| Signal | Indicator |
|--------|-----------|
| `byom.stream.interruption.total` rate > 0.5 % of sessions | Streams ending without a `done` event |
| `byom.stream.chunk.total` drops while `interruption.total` rises | Data pipeline is truncating |
| Users report incomplete AI responses | Visible symptom of stream breakage |

---

## 2  Immediate Mitigation Steps

### Step 1 — Confirm the scope

Determine whether the interruptions are:
- **Provider-specific** (`providerId` label on `byom.stream.interruption.total`)
- **Global** (all providers affected)
- **Time-correlated** (did a deployment or network change occur recently?)

```promql
# Per-provider interruption rate
rate(byom_stream_interruption_total[5m]) by (providerId)
```

### Step 2 — Check network path stability

Stream interruptions often indicate network-level issues between the bridge and
the adapter's upstream endpoint:

```bash
# Test connectivity to the provider endpoint
curl -v --max-time 30 https://api.provider.example/v1/stream-test

# Check local network interface
ip route get <provider-host-ip>
```

### Step 3 — Review bridge and adapter logs

```bash
# Look for connection reset or EOF errors
grep -i "interrupted\|connection reset\|EOF\|ECONNRESET" ~/.byom/bridge.log | tail -50
grep -i "stream\|disconnect\|abort" ~/.byom/adapters/<provider-id>/adapter.log | tail -50
```

### Step 4 — Increase stream timeout if warranted

If slow provider responses are causing premature timeout interruptions:

1. Check current `timeoutMs` configuration in the adapter manifest
2. Increase if the provider's documented response time exceeds the current threshold
3. Re-load the adapter: `byom adapter reload <provider-id>`

### Step 5 — Check backpressure

High `byom.stream.chunk.total` rates with backpressure drops indicate the
consumer (extension/SDK) is not reading fast enough:

- Check extension background worker CPU usage
- Consider buffering or throttling at the consumer

---

## 3  Escalation Path

| Condition | Action |
|-----------|--------|
| Interruptions affect > 10 % of sessions | Page on-call; consider disabling streaming for affected provider |
| Provider's status page shows outage | Disable streaming, fall back to `chat.completions`, notify users |
| Interruptions occur within a fixed TTL window | Likely provider-side streaming timeout; adjust `streamTimeoutMs` |

---

## 4  Permanent Fix Checklist

- [ ] Root cause identified (network jitter, timeout, provider-side, etc.)
- [ ] Stream timeout configuration validated per provider
- [ ] Retry / resume logic evaluated for large stream sessions
- [ ] `withStreamTimeout` wrapper reviewed for off-by-one edge cases
- [ ] Backpressure monitoring added to detect slow consumers
- [ ] Load test re-run to confirm fix in staging (see `ops/tests/soak/stream-soak.test.ts`)

---

## 5  Evidence Collection

1. Export `byom.stream.interruption.total` and `byom.stream.chunk.total` time series
2. Correlate with deployment timeline (check git log / release notes)
3. Capture bridge log lines containing `stream` or `interrupt` keywords
4. Record provider availability status at time of surge
5. Note P99 stream duration from `byom.request.duration_ms` for `capability=chat.stream`

---

## 6  Related

- Alert: `BYOM_HighStreamInterruptionRate`
- Runbook: `ops/runbooks/adapter-crash-loop.md`
- Runbook: `ops/runbooks/bridge-unavailable.md`
- Soak test: `ops/tests/soak/stream-soak.test.ts`
- SLO: `ops/slo/slo-definitions.md#slo-03`
