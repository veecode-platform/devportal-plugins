---
'@veecode-platform/plugin-aws-cost-insights': minor
---

The entity cluster cost card finds an entity's in-cluster cost by its Kubernetes label selector when the selector is a single `key=value` term, instead of showing no workload for it. Such a selector wins over the namespace and `kubernetes-id` annotations; any other selector keeps the namespace matching. The card shows the last 7 days and a monthly projection of that total.
