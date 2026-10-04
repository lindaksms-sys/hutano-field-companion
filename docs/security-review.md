# Security review

Reviewed 4 October 2026 against GitHub and the matching Lovable extraction, repository and sync implementation.

## Controls observed

Hybrid extraction reconstructs literal source sentences. Human verification is explicit and invalidated by later edits. Account-partitioned local records, explicit adoption, single-flight outbox draining, stable revision IDs and account-epoch guards are implemented. The copied backend schema limits authenticated access to owned verified synthetic insert/select operations.

## Findings and limits

1. Encounter records are unencrypted in IndexedDB. An unlocked/shared browser profile can expose them; sign-out hides rather than deletes records. No remote wipe exists.
2. Shared synthetic hackathon demo credentials are already published in the existing README. They are preserved in the implementation guide for submission continuity. Keep the account synthetic-only and review/remove its access after judging.
3. Storage eviction and browser/device constraints can affect durability and model installation. Model download is not proof of successful inference.
4. Shona sentence selection remains unvalidated. Small synthetic evaluation results do not establish clinical or population-level accuracy.
5. Server data is append-only. Local deletion cannot erase uploaded snapshots. Sync is upload-only while the app is open.
6. Public Supabase configuration and browser auth storage are not server secrets. RLS remains essential; deployed policies were not queried in this review.

## Scope

Static current-source and checked-in schema review; no live patient records, database writes or new clinical claims. It is not a penetration test, history-wide secret scan or field evaluation. This PR changes documentation/ignore rules only and preserves the existing backend schema and deployment behavior.
