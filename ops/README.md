# @byom-ai/ops

Reliability engineering assets for BYOM AI — SLO definitions, alert rules, runbooks, and test suites.

## Structure

```
ops/
├── slo/
│   ├── slo-definitions.md    # Service-level objectives
│   └── alert-rules.md        # Alerting thresholds and conditions
├── runbooks/
│   ├── adapter-crash-loop.md  # Adapter restart/crash recovery
│   ├── auth-failure-spike.md  # Authentication failure investigation
│   ├── bridge-unavailable.md  # Bridge connectivity issues
│   └── stream-interruption.md # Streaming failure diagnosis
└── tests/
    ├── chaos/                 # Fault injection scenarios
    ├── release-gates/         # CI release-conformance gates
    ├── soak/                  # Long-running stability tests
    └── version-skew/          # Cross-version compatibility tests
```

## Running Tests

```bash
# All reliability suites
npm run test -- ./ops/tests/chaos
npm run test -- ./ops/tests/release-gates
npm run test -- ./ops/tests/soak
npm run test -- ./ops/tests/version-skew
```

## Runbooks

Each runbook covers a specific operational scenario with symptoms, diagnosis steps, and remediation actions. See the [runbooks/](runbooks/) directory.
