# Runbook: Bridge Unavailable

**Alert:** `ARLOPASS_BridgeUnavailable`  
**SLO:** SLO-01 (Request success rate)  
**Severity:** Critical  
**Owner:** Platform Reliability

---

## 1  Detection Signals

| Signal | Indicator |
|--------|-----------|
| `arlopass.request.total` absent for > 3 min | Bridge has stopped processing messages |
| `arlopass.request.failure.total` spike | Bridge returning errors on all message types |
| Extension UI shows "Bridge disconnected" | User-visible connectivity failure |

---

## 2  Immediate Mitigation Steps

### Step 1 — Verify bridge process is running

On the affected machine:

```bash
# macOS / Linux
ps aux | grep arlopass-bridge

# Windows
Get-Process | Where-Object { $_.Name -like "*arlopass*" }
```

If the process is not found, proceed to **Step 3** (restart).

### Step 2 — Check bridge logs

```bash
# Default log location
cat ~/.arlopass/bridge.log | tail -100

# Or via journald on Linux
journalctl -u arlopass-bridge --since "5 minutes ago"
```

Look for:
- `fatal:` lines indicating an uncaught exception
- Permission denied errors on the native messaging manifest
- Port conflicts or socket binding failures

### Step 3 — Restart the bridge

```bash
# macOS / Linux
~/.arlopass/bin/arlopass-bridge &

# Windows (PowerShell)
Start-Process "$env:LOCALAPPDATA\Arlopass\bin\arlopass-bridge.exe"
```

Wait 30 seconds, then verify the extension reconnects.

### Step 4 — Validate connectivity

Send a test handshake from the extension dev console:

```javascript
chrome.runtime.sendMessage({ type: "handshake.challenge" }, console.log);
```

Expected response: `{ type: "handshake.challenge", nonce: "...", ... }`

### Step 5 — Check shared secret alignment

If the handshake fails with `auth.invalid`:
1. Verify `ARLOPASS_BRIDGE_SHARED_SECRET` env var is consistent between bridge and extension.
2. Re-run the installation script to regenerate the shared secret.

---

## 3  Escalation Path

| Condition | Action |
|-----------|--------|
| Bridge restarts but immediately crashes | Capture crash dump and escalate to engineering |
| Bridge is running but extension cannot connect | Check native messaging host registration and browser policy |
| Multiple users affected simultaneously | Suspect deployment regression; rollback to previous version |

---

## 4  Permanent Fix Checklist

- [ ] Root cause identified in post-mortem
- [ ] Crash log captured and filed as bug
- [ ] Health probe added / improved to prevent silent failure
- [ ] Deployment automation verified to restart bridge on crash
- [ ] SLO error budget impact recorded

---

## 5  Evidence Collection

Before restarting:
1. Capture `bridge.log` tail (last 500 lines)
2. Record `ps aux` / process list snapshot
3. Note exact time of `ARLOPASS_BridgeUnavailable` alert trigger
4. Export telemetry dashboard screenshot showing metric gap

---

## 6  Related

- Alert: `ARLOPASS_HighRequestFailureRate`
- Runbook: `ops/runbooks/adapter-crash-loop.md`
- SLO: `ops/slo/slo-definitions.md#slo-01`
