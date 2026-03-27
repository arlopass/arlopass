# Runbook: Adapter Crash-Loop

**Alert:** `ARLOPASS_AdapterCrashLoop`, `ARLOPASS_AdapterDegraded`  
**SLO:** SLO-04 (Adapter health availability)  
**Severity:** Critical (crash-loop), Warning (degraded)  
**Owner:** Platform Reliability

---

## 1  Detection Signals

| Signal | Indicator |
|--------|-----------|
| `arlopass.adapter.health` gauge = 0 for > 2 min | Adapter health check consistently failing |
| `arlopass.retry.total` > 3 in 10 min | Adapter host is repeatedly restarting the adapter |
| `state = "failed"` in adapter health API | Adapter has exhausted restart limit |
| `arlopass.request.failure.total` spike for specific `providerId` | Requests to affected provider are all failing |

---

## 2  Immediate Mitigation Steps

### Step 1 — Identify affected adapter

Check adapter health status from the bridge logs or API:

```javascript
// From extension background context
chrome.runtime.sendMessage({ type: "request.check" }, console.log);
```

Or look for the `providerId` label on `arlopass.retry.total` metric.

### Step 2 — Examine adapter logs

```bash
cat ~/.arlopass/adapters/<provider-id>/adapter.log | tail -100
```

Common causes:
- **Auth expired**: Token or API key has expired (see `auth-failure-spike.md`)
- **Network unreachable**: Adapter cannot reach the upstream provider endpoint
- **Binary crash**: Adapter process segfault or OOM
- **Configuration mismatch**: Adapter manifest incompatible with installed version

### Step 3 — Force adapter restart

If the adapter is in `FAILED` state (restart limit exceeded), the host must be
instructed to reload it:

1. Deregister the adapter from the bridge (via settings UI or CLI):
   ```bash
   arlopass adapter remove <provider-id>
   ```
2. Re-register with fresh credentials if auth-related:
   ```bash
   arlopass adapter add <provider-id> --reconfigure
   ```
3. Verify health via `arlopass adapter status <provider-id>`.

### Step 4 — Verify recovery

```bash
# Watch adapter health gauge
watch -n 5 'arlopass adapter status all'
```

`arlopass.adapter.health` gauge should return to `1` within 60 seconds.

### Step 5 — Short-term mitigation if adapter is unavailable

- Instruct users to switch to an alternative provider via the extension UI.
- If all adapters are affected, check for a bridge-level issue (see `bridge-unavailable.md`).

---

## 3  Escalation Path

| Condition | Action |
|-----------|--------|
| Crash-loop repeating every < 1 min | Disable the adapter and engage adapter vendor |
| Multiple adapters failing simultaneously | Suspect bridge or sandbox regression |
| Auth errors after token rotation | Re-generate and redistribute credentials |

---

## 4  Permanent Fix Checklist

- [ ] Adapter vendor notified if upstream service is the cause
- [ ] Adapter version pinned if regression introduced in new release
- [ ] `maxRestarts` configuration reviewed for appropriate backoff
- [ ] Health check timeout reviewed — may need increasing for slow providers
- [ ] Signature verification status confirmed (adapter artifacts re-signed if needed)

---

## 5  Evidence Collection

Before restarting:
1. Capture `arlopass.adapter.health` gauge time series for the 30 min window
2. Export `arlopass.retry.total` count for the affected `providerId`
3. Capture adapter log tail (last 200 lines)
4. Record `state` from `listAdapterHealth()` API response

---

## 6  Related

- Alert: `ARLOPASS_AdapterDegraded`, `ARLOPASS_AdapterCrashLoop`
- Runbook: `ops/runbooks/bridge-unavailable.md`
- Runbook: `ops/runbooks/auth-failure-spike.md`
- SLO: `ops/slo/slo-definitions.md#slo-04`
