/**
 * Build-time data fetcher for the Probo Trust Center.
 *
 * Requires two env vars:
 *   PROBO_API_TOKEN        – Bearer token from Probo settings
 *   PROBO_ORGANIZATION_ID  – The org whose trust center to render
 *
 * GraphQL endpoint: https://probo.routena.com/api/console/v1/graphql
 */

const PROBO_URL =
    import.meta.env.PROBO_URL ?? "https://probo.routena.com";
const GRAPHQL_ENDPOINT = `${PROBO_URL}/api/console/v1/graphql`;
const TOKEN = import.meta.env.PROBO_API_TOKEN ?? "";
const ORG_ID = import.meta.env.PROBO_ORGANIZATION_ID ?? "";

// ── Types ────────────────────────────────────────────────────────────

export interface TrustCenterFramework {
    id: string;
    name: string;
    description: string | null;
}

export interface TrustCenterControl {
    id: string;
    sectionTitle: string;
    name: string;
    description: string | null;
    implemented: "IMPLEMENTED" | "NOT_IMPLEMENTED";
    frameworkName: string;
    category: string;
}

export interface TrustCenterMeasure {
    id: string;
    name: string;
    category: string;
    state: "NOT_STARTED" | "IN_PROGRESS" | "IMPLEMENTED" | "NOT_APPLICABLE";
}

export interface TrustCenterDocument {
    id: string;
    title: string;
    documentType: string;
    classification: string;
    currentPublishedVersion: number | null;
}

export interface TrustCenterVendor {
    id: string;
    name: string;
    category: string;
    websiteUrl: string | null;
    description: string | null;
}

export interface TrustCenterAudit {
    id: string;
    name: string | null;
    state: string;
    validFrom: string | null;
    validUntil: string | null;
    frameworkName: string | null;
}

export interface TrustCenterData {
    organizationName: string;
    organizationDescription: string | null;
    frameworks: TrustCenterFramework[];
    controls: TrustCenterControl[];
    measures: TrustCenterMeasure[];
    documents: TrustCenterDocument[];
    vendors: TrustCenterVendor[];
    audits: TrustCenterAudit[];
    fetchedAt: string;
}

// ── GraphQL helpers ──────────────────────────────────────────────────

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
        throw new Error(`Probo GraphQL ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();
    if (json.errors?.length) {
        throw new Error(`Probo GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data as T;
}

// ── Queries ──────────────────────────────────────────────────────────

const TRUST_CENTER_QUERY = `
  query TrustCenterPage($orgId: ID!) {
    node(id: $orgId) {
      ... on Organization {
        id
        name
        description
        frameworks(first: 50) {
          edges {
            node {
              id
              name
              description
              controls(first: 100, orderBy: { field: SECTION_TITLE, direction: ASC }) {
                edges {
                  node {
                    id
                    sectionTitle
                    name
                    description
                    implemented
                  }
                }
              }
            }
          }
        }
        measures(first: 100, orderBy: { field: NAME, direction: ASC }) {
          edges {
            node {
              id
              name
              category
              state
            }
          }
        }
        documents(
          first: 50
          orderBy: { field: TITLE, direction: ASC }
          filter: { status: [ACTIVE] }
        ) {
          edges {
            node {
              id
              title
              documentType
              classification
              currentPublishedVersion
              trustCenterVisibility
            }
          }
        }
        vendors(first: 50, orderBy: { field: NAME, direction: ASC }) {
          edges {
            node {
              id
              name
              category
              websiteUrl
              description
              showOnTrustCenter
            }
          }
        }
        audits(first: 20, orderBy: { field: VALID_UNTIL, direction: DESC }) {
          edges {
            node {
              id
              name
              state
              validFrom
              validUntil
              trustCenterVisibility
              framework {
                name
              }
            }
          }
        }
      }
    }
  }
`;

// ── Public API ────────────────────────────────────────────────────────

/** Only show these frameworks on the trust center */
const TARGET_FRAMEWORKS = ["ISO 27001", "ISO 42001", "SOC 2", "SOC 2 Type II", "GDPR"];

function matchesTargetFramework(name: string): boolean {
    return TARGET_FRAMEWORKS.some(
        (t) => name.toLowerCase().includes(t.toLowerCase())
    );
}

/**
 * Map a control name/section to a human-friendly category
 * based on common compliance taxonomy.
 */
function categorizeControl(name: string, section: string): string {
    const lower = `${name} ${section}`.toLowerCase();

    if (/access.control|authori[zs]ation|identity|authenticat|privilege|credential|sso|mfa|rbac/i.test(lower))
        return "Access Control and Authorization";
    if (/infrastructure|network|firewall|load.balanc|dns|cdn|cloud.config|server|container/i.test(lower))
        return "Infrastructure Security";
    if (/vulnerabilit|patch|penetration|scan|remediat/i.test(lower))
        return "Vulnerability Management";
    if (/disaster|recovery|backup|restor|continuity|failover|redundanc/i.test(lower))
        return "Disaster Recovery";
    if (/monitor|incident|response|detect|alert|siem|log|threat/i.test(lower))
        return "Monitoring and Incident Response";
    if (/organi[sz]ation|governance|policy|role|responsibilit|management.review|leadership/i.test(lower))
        return "Organizational Security";
    if (/endpoint|device|mobile|workstation|antivirus|edr|mdm/i.test(lower))
        return "Endpoint Security";
    if (/data.management|data.protect|encrypt|classif|retention|disposal|privacy|personal.data|dpia|processing/i.test(lower))
        return "Data Management and Protection";
    if (/risk|assessment|treatment|appetite|register/i.test(lower))
        return "Risk Management";
    if (/email|phishing|spam|dmarc|spf|dkim/i.test(lower))
        return "Email Security";
    if (/human.resource|hr|personnel|awareness|training|onboard|offboard|background/i.test(lower))
        return "Human Resources Security";
    if (/vendor|supplier|third.party|sub.?processor|outsourc/i.test(lower))
        return "Vendor Management";
    if (/change.management|release|deployment|ci.?cd|sdlc|development|code.review|secure.cod/i.test(lower))
        return "Change Management";
    if (/physical|facility|office|visitor|badge|cctv/i.test(lower))
        return "Physical Security";
    if (/asset|inventory|cmdb|hardware|software.asset/i.test(lower))
        return "Asset Management";
    if (/compliance|audit|legal|regulat|certif|obligation|contract/i.test(lower))
        return "Compliance and Audit";
    if (/communicat|transfer|api|integration|interface/i.test(lower))
        return "Communications Security";
    if (/crypto|key.management|certificate|tls|ssl|pki/i.test(lower))
        return "Cryptography";

    return "General Controls";
}

export async function fetchTrustCenterData(): Promise<TrustCenterData | null> {
    if (!TOKEN || !ORG_ID) {
        console.warn(
            "[trust-center] Missing PROBO_API_TOKEN or PROBO_ORGANIZATION_ID — skipping data fetch."
        );
        return null;
    }

    try {
        const data = await gql<{ node: any }>(TRUST_CENTER_QUERY, { orgId: ORG_ID });
        const org = data.node;

        // Flatten frameworks + controls (only target frameworks)
        const frameworks: TrustCenterFramework[] = [];
        const controls: TrustCenterControl[] = [];

        for (const fEdge of org.frameworks?.edges ?? []) {
            const fw = fEdge.node;
            if (!matchesTargetFramework(fw.name)) continue;
            frameworks.push({
                id: fw.id,
                name: fw.name,
                description: fw.description,
            });
            for (const cEdge of fw.controls?.edges ?? []) {
                const ctrl = cEdge.node;
                controls.push({
                    id: ctrl.id,
                    sectionTitle: ctrl.sectionTitle,
                    name: ctrl.name,
                    description: ctrl.description,
                    implemented: ctrl.implemented,
                    frameworkName: fw.name,
                    category: categorizeControl(ctrl.name, ctrl.sectionTitle),
                });
            }
        }

        // Measures
        const measures: TrustCenterMeasure[] = (org.measures?.edges ?? []).map(
            (e: any) => ({
                id: e.node.id,
                name: e.node.name,
                category: e.node.category,
                state: e.node.state,
            })
        );

        // Documents — only show PUBLIC ones
        const documents: TrustCenterDocument[] = (org.documents?.edges ?? [])
            .filter((e: any) => e.node.trustCenterVisibility === "PUBLIC")
            .map((e: any) => ({
                id: e.node.id,
                title: e.node.title,
                documentType: e.node.documentType,
                classification: e.node.classification,
                currentPublishedVersion: e.node.currentPublishedVersion,
            }));

        // Vendors — only trust-center-visible
        const vendors: TrustCenterVendor[] = (org.vendors?.edges ?? [])
            .filter((e: any) => e.node.showOnTrustCenter)
            .map((e: any) => ({
                id: e.node.id,
                name: e.node.name,
                category: e.node.category,
                websiteUrl: e.node.websiteUrl,
                description: e.node.description,
            }));

        // Audits — only public
        const audits: TrustCenterAudit[] = (org.audits?.edges ?? [])
            .filter((e: any) => e.node.trustCenterVisibility === "PUBLIC")
            .map((e: any) => ({
                id: e.node.id,
                name: e.node.name,
                state: e.node.state,
                validFrom: e.node.validFrom,
                validUntil: e.node.validUntil,
                frameworkName: e.node.framework?.name ?? null,
            }));

        return {
            organizationName: org.name,
            organizationDescription: org.description,
            frameworks,
            controls,
            measures,
            documents,
            vendors,
            audits,
            fetchedAt: new Date().toISOString(),
        };
    } catch (err) {
        console.error("[trust-center] Failed to fetch Probo data:", err);
        return null;
    }
}
