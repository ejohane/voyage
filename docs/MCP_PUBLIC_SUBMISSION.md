# Voyage public plugin submission

This file contains the non-secret materials for a Voyage public plugin draft. Never commit reviewer
credentials, OAuth tokens, domain challenge tokens, or recovery codes.

## Listing

- **Name:** Voyage
- **Short description:** Plan and safely update trips with Voyage.
- **Long description:** Connect your Voyage account to review trip workspaces, create trips, add
  itinerary items, and apply explicitly confirmed corrections without leaving the conversation.
- **Category:** Travel
- **Website:** https://voyageplan.app
- **Support:** https://voyageplan.app/support
- **Privacy:** https://voyageplan.app/privacy
- **Terms:** https://voyageplan.app/terms
- **Production MCP URL:** https://mcp.voyageplan.app/mcp
- **URL type:** Universal
- **Authentication:** OAuth 2.0 / OpenID Connect through Voyage Clerk

The logo is `plugins/voyage/assets/voyage-logo.png`. Starter prompts are stored in the plugin
manifest. Reviewer cases are stored in `apps/mcp/evals/phase-3.json`.

## Release notes

Initial Voyage submission. The plugin reads membership-scoped trip workspaces, creates private
trips, adds confirmed itinerary batches, and applies confirmed correction-only updates with
optimistic concurrency and idempotent audit records. It does not delete data, change access, send
messages, import email, or perform bookings.

## User-owned portal steps

1. Confirm the publishing OpenAI organization grants the submitter Apps Management write access.
2. Complete individual or business verification for the publisher identity shown in the listing.
3. Create a dedicated reviewer account with representative trips and no MFA, SMS, email challenge,
   or private-network requirement. Store its credentials only in the submission portal.
4. Create a plugin draft with MCP, enter the Universal production endpoint, and request a domain
   challenge.
5. Store the exact challenge value as the production Worker secret `OPENAI_APPS_CHALLENGE`, deploy,
   and verify the well-known endpoint returns only that token.
6. Scan tools and verify names, schemas, security schemes, and all three annotations for every tool.
7. Enter the five positive and three negative cases, availability, policy attestations, and release
   notes. Run every case with the reviewer account before submitting.
8. Submit for review. Approval does not publish automatically; publish the approved version from
   the portal when ready.

Public submission and publication are external release actions. Do not perform them from CI or a
repository merge.
