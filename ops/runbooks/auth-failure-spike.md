# Runbook: Auth Failure Spike

**Alert:** `ARLOPASS_AuthFailureSpike`  
**SLO:** SLO-01 (Request success rate — auth sub-category)  
**Severity:** Warning  
**Owner:** Platform Reliability

---

## 1  Detection Signals

| Signal | Indicator |
|--------|-----------|
| `arlopass.request.failure.total{reasonCode=~"auth.*"}` > 2 % of requests | Auth failures are disproportionately high |
| Bridge logs contain `auth.invalid` or `auth.expired` | Token or credential validation failing |
| Users report "Unauthorized" or permission denied in extension UI | Visible symptom of auth breakage |

---

## 2  Immediate Mitigation Steps

### Step 1 — Identify the failing auth type

From telemetry, filter by `reasonCode`:

| `reasonCode` | Likely cause |
|-------------|-------------|
| `auth.invalid` | Wrong credentials or HMAC mismatch |
| `auth.expired` | Token/API key has expired |
| `auth.rate_limited` | Provider API rate limit hit |

### Step 2 — Check token validity

For OAuth2-based adapters:
```bash
# Inspect the token expiry stored in the adapter configuration
cat ~/.arlopass/adapters/<provider-id>/credentials.json | jq '.expiresAt'
```

For API-key-based adapters:
```bash
# Verify the key against the provider's status API (replace URL with actual)
curl -H "Authorization: Bearer $(cat ~/.arlopass/adapters/<provider-id>/api-key)" \
     https://api.provider.example/v1/models
```

### Step 3 — Re-authenticate the affected adapter

```bash
arlopass adapter re-auth <provider-id>
```

This will:
1. Clear the cached credential
2. Trigger the provider's auth flow (browser redirect or API key prompt)
3. Store the new credential in the adapter's credential store

### Step 4 — Monitor recovery

Watch `arlopass.request.failure.total{reasonCode=~"auth.*"}` in the dashboard.
The failure rate should return to baseline within 2–3 minutes of successful
re-authentication.

### Step 5 — Check credential rotation schedule

If auth failures recur on a predictable cycle:
1. Inspect the token TTL: `cat ~/.arlopass/adapters/<provider-id>/credentials.json | jq '.ttlSeconds'`
2. Set up automated token refresh if not already in place
3. Increase warning threshold for token expiry events

---

## 3  Escalation Path

| Condition | Action |
|-----------|--------|
| All users affected simultaneously | Suspect a provider-side outage or credential rotation event |
| Re-auth fails consistently | Verify ARLOPASS_BRIDGE_SHARED_SECRET integrity; re-install if corrupted |
| Rate limiting from provider | Implement request throttling and backoff; notify affected users |

---

## 4  Permanent Fix Checklist

- [ ] Token refresh automation implemented for OAuth2 adapters
- [ ] Expiry warning alert added (warn at 80 % of TTL elapsed)
- [ ] Credential rotation procedure documented per provider
- [ ] HMAC shared-secret rotation playbook reviewed and tested
- [ ] Rate-limit backoff logic added to affected adapter

---

## 5  Evidence Collection

1. Export `arlopass.request.failure.total` time series filtered by `reasonCode=~"auth.*"`
2. Capture bridge log lines containing `auth` errors for the window
3. Record exact `expiresAt` timestamp from adapter credentials
4. Note whether failure affects a single provider or all providers

---

## 6  Related

- Alert: `ARLOPASS_AuthFailureSpike`
- Runbook: `ops/runbooks/bridge-unavailable.md`
- Runbook: `ops/runbooks/adapter-crash-loop.md`
- SLO: `ops/slo/slo-definitions.md#slo-01`
