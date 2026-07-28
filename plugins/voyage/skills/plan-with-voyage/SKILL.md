---
name: plan-with-voyage
description: Plan trips with a connected Voyage account. Use when the user wants to list or inspect Voyage trips, create a trip, add transportation, stays, or plans, or safely correct existing trip and itinerary details from ChatGPT or Codex.
---

# Plan With Voyage

Use Voyage as the trip system of record. Keep planning conversational, but distinguish proposed,
confirmed, saved, and verified states precisely.

## Start from current data

1. Call `get_connection_status` when connection or capability is uncertain.
2. Use `list_trips` to identify the trip rather than guessing an ID.
3. Call `get_trip` before planning against an existing trip.
4. Treat its destination IDs and `updatedAt` values as the current revision contract.

Do not expose account subjects, confirmation tokens, idempotency keys, or internal identifiers in the
user-facing answer. Destination and itinerary IDs may be used between tools but need not be shown.

## Read and plan

Answer read-only questions directly from `list_trips` and `get_trip`. If the user asks to plan or
brainstorm without asking to save, keep the work in the conversation and do not invoke write tools.
Never claim a preview or conversational suggestion is saved.

## Create or add

For a new trip, call `preview_trip`. For transportation, stays, or plans on an existing trip, call
`get_trip` for current destination IDs and then `preview_itinerary_items`.

After a preview:

1. Present the exact proposed values in readable form.
2. Ask for explicit confirmation of that proposal.
3. Only after confirmation, call the paired write tool with unchanged proposal fields and token.
4. Generate a fresh UUID idempotency key for the operation. Reuse it only to retry that exact write.
5. Report whether the write was new or an idempotent replay and include the returned Voyage link.

## Correct existing data

Always call `get_trip` immediately before preparing corrections.

- Use `preview_trip_update` for a trip name or existing destination names and dates.
- Use `preview_itinerary_updates` for existing transportation, stays, or plans.
- Pass the exact `updatedAt` revision returned by `get_trip` for every corrected resource.
- Show before and after values and obtain explicit confirmation before the paired update tool.
- Keep every field and revision unchanged between preview and update.
- If Voyage reports a stale revision, load the trip again, explain what changed, and prepare a new
  preview. Never silently overwrite newer data.

After a successful correction, call `get_trip` when the user needs verified current state rather
than only the write receipt.

## Boundaries

Do not attempt deletion, destination removal or reordering, invitations, Gmail import, email or
message sending, purchases, reservations, or booking actions. Explain the boundary briefly and link
to the returned Voyage trip when the user can finish the action there.

Do not use a generic earlier approval as confirmation for a later concrete write. Confirmation must
follow the exact preview that will be saved.
