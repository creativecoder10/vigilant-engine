# Decision record — ECS/Fargate vs. EKS for Phase 7

**Status:** Open — not decided. This document lays out the trade-off so
the decision can be made deliberately when time is available to research
it properly, rather than defaulted into either direction.
**Owner:** Deepesh Dang
**Last updated:** 2026-09-15
**Relationship to main project:** feeds directly into
[docs/PRD_PHASE7_AWS_DEPLOYMENT.md](PRD_PHASE7_AWS_DEPLOYMENT.md) — Phase
7's `ecs.tf` (or a future `eks.tf`) depends on which way this resolves.

## 1. Why this decision exists

`Plan_vigilant_engine.md`'s Phase 7 currently targets ECS/Fargate — an
already-scoped Terraform plan (VPC/ECR/RDS/ECS/ALB). Separately, an
AppSec Engineer posting (Endeavour Group, surfaced 2026-09-11) names
**Kubernetes** specifically in its stack, which ECS doesn't cover. None
of the other three current target-role postings (LEAP, ASX, Australia
Post) name Kubernetes at all. That mismatch is what this document exists
to resolve — not "is Kubernetes worth learning" in the abstract, but
"does *this project's* Phase 7 need to be the vehicle for it."

## 2. The three real options

| Option | Description |
| --- | --- |
| **A — ECS only** | Build Phase 7 exactly as currently planned. Kubernetes stays a documented gap, not addressed by this project. |
| **B — Replace with EKS** | Swap Phase 7's `ecs.tf` for an EKS cluster + node group (or Fargate profiles) + Kubernetes manifests, replacing ECS entirely as the orchestration layer. |
| **C — ECS for Phase 7, K8s as a separate small addition** | Keep Phase 7's ECS plan unchanged; add a *separate*, smaller local-cluster project (`kind`/`minikube`, no AWS EKS spend) demonstrating K8s-native security controls — Pod Security Standards, NetworkPolicies, RBAC, Secrets, and optionally an OPA/Kyverno admission policy tied to the already-planned container-image scanner idea. Tracked in `PROJECT_ROADMAP.md`, not in Phase 7. |

Worth being explicit that B and C aren't really the same decision at
different sizes — B changes what Phase 7 *is* (a different orchestrator
for the same AWS deployment), while C leaves Phase 7 untouched and adds
a second, independent artifact aimed specifically at K8s *security*
concepts rather than K8s *operations*.

## 3. Trade-offs to weigh

### Cost (if left running, not torn down)

| | ECS/Fargate | EKS |
| --- | --- | --- |
| Control plane | No separate charge | ~$0.10/hr flat (~$73/month) regardless of cluster size |
| Compute | Fargate task vCPU/memory, same either way if EKS also uses Fargate profiles | Same Fargate cost, *plus* the control-plane charge above — or EC2 worker nodes to manage instead |
| Shared costs | NAT gateway, ALB, RDS — identical in both options, not a differentiator | Same |

EKS is strictly more expensive than ECS for equivalent workload size,
because of the control-plane fee ECS doesn't have. This matters more
under the deploy-and-teardown framing in
[PRD_PHASE7_AWS_DEPLOYMENT.md §6](PRD_PHASE7_AWS_DEPLOYMENT.md) if the
cluster is stood up more than once for demos.

### Operational / learning complexity

EKS meaningfully increases the surface area beyond "one more Terraform
resource block": `kubectl`, raw manifests or Helm charts, an ingress
controller (typically the AWS Load Balancer Controller, itself a
separate install with its own IAM role via IRSA), pod-level IAM (IRSA)
replacing ECS task roles, and cluster-level upgrade/patching concerns
that ECS's fully-managed model doesn't have. This is real additional
time, not a rounding error — worth estimating honestly against however
much time is actually available before assuming it fits alongside
Phase 8/9.

### What each option actually proves to an interviewer

- **ECS (A or C's Phase 7 half):** "I can provision managed container
  orchestration on AWS with secure defaults" — proven either way,
  regardless of B/C.
- **Full EKS build (B):** proves cluster *operations* competence
  (networking, ingress, node/pod IAM) on top of the same security
  defaults — closer to a platform/infra engineer skill profile than an
  AppSec IC one.
- **Local K8s security lab (C's addition):** proves K8s-*security*
  literacy specifically — Pod Security Standards, NetworkPolicies,
  RBAC, admission control — which is the more likely thing an AppSec
  interviewer actually probes when a posting says "Kubernetes," as
  opposed to "have you personally run a cluster." Notably, none of this
  requires real AWS EKS spend — a local `kind` cluster demonstrates the
  same security controls.

### Relevance to actual target roles

LEAP, ASX, and Australia Post — the three roles this whole portfolio is
currently prioritized around — don't name Kubernetes. Only the
Endeavour posting does, and it's already flagged (see
`PROJECT_ROADMAP.md`) as a strong current-fit posting but not one of
the three primary targets. That asymmetry is the main argument for not
letting this one posting reshape Phase 7's already-scoped AWS plan.

## 4. Questions worth answering before deciding

- How much realistic project time is available before Phase 7 needs to
  start — enough to absorb EKS's extra learning curve on top of
  Terraform/ECS basics, or is that time better spent finishing Phase
  8/9 and the still-open manual/source-level project
  (`PROJECT_ROADMAP.md`'s pentest-report vs. OSS-CVE-case-study choice)?
- Is there a concrete, current interview pipeline where EKS specifically
  (not Kubernetes concepts generally) would be asked about directly? If
  not, option C's local-cluster approach gets the same interview-answer
  value at a fraction of the AWS cost and setup time.
- Does the CV story benefit more from "one AWS deployment, done well"
  (A/C) or "two different orchestrators, both working" (B) — is breadth
  or depth the better argument for the roles actually being targeted?

## 5. Recommendation (non-binding — flagged as my read, not a decision)

Option C was raised as the working lean in earlier project discussion —
keep Phase 7's ECS plan unchanged, treat the Kubernetes gap as a
separate, smaller, security-focused local-cluster addition rather than
an EKS migration. That lean is **not treated as decided** — this
document exists specifically because the call needs real research time,
not a quick default. Update the table in §2 and this section once a
decision is actually made, and update
[PRD_PHASE7_AWS_DEPLOYMENT.md §7](PRD_PHASE7_AWS_DEPLOYMENT.md) to match
rather than letting the two documents disagree.

## References

- [docs/PRD_PHASE7_AWS_DEPLOYMENT.md](PRD_PHASE7_AWS_DEPLOYMENT.md) —
  Phase 7's PRD; this decision blocks its `ecs.tf`/`eks.tf` choice
- [Plan_vigilant_engine.md, Phase 7](../Plan_vigilant_engine.md) —
  task-level checklist, currently written for ECS
- `PROJECT_ROADMAP.md`
  (`/Users/deepeshdang/Documents/Learning/Security /notes/`) — where the
  Endeavour posting's Kubernetes gap and the container-image-scanner /
  admission-control idea are tracked
