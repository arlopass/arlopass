# Arlopass Program Sequencing and Dependency Gates

## Execution Order (Mandatory)

1. `docs/superpowers/plans/2026-03-23-core-protocol-sdk-plan.md`
2. `docs/superpowers/plans/2026-03-23-secure-mediation-surface-plan.md`
3. `docs/superpowers/plans/2026-03-23-enterprise-security-policy-plan.md`
4. `docs/superpowers/plans/2026-03-23-provider-adapter-runtime-plan.md`
5. `docs/superpowers/plans/2026-03-23-reliability-operations-platform-plan.md`

## Dependency Rationale

- Core protocol + SDK establishes shared contracts and error semantics.
- Secure mediation depends on canonical protocol/SDK transport contracts.
- Enterprise policy depends on mediation enforcement hooks plus canonical `reasonCode` and `correlationId` standards.
- Adapter runtime depends on protocol contracts, mediation/auth context, and enterprise policy decisions for egress/permission enforcement.
- Reliability/operations depends on all prior components for complete instrumentation and hardening.

## Gate Criteria Between Plans

- **Gate 1 (after plan #1):** protocol/schema and SDK tests green.
- **Gate 2 (after plan #2):** authenticated transport + grant/revoke flows green.
- **Gate 3 (after plan #3):** policy enforcement and audit/secret governance green.
- **Gate 4 (after plan #4):** adapter conformance, policy-coupled egress checks, and signing checks green.
- **Gate 5 (after plan #5):** chaos/soak/version-skew reliability gates green.
