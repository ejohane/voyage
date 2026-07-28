import evals from "../evals/phase-3.json" with { type: "json" };

const toolNames = new Set([
  "get_connection_status",
  "list_trips",
  "get_trip",
  "preview_trip",
  "create_trip",
  "preview_itinerary_items",
  "add_itinerary_items",
  "preview_trip_update",
  "update_trip",
  "preview_itinerary_updates",
  "update_itinerary_items",
]);
const mutationTools = new Set([
  "create_trip",
  "add_itinerary_items",
  "update_trip",
  "update_itinerary_items",
]);

if (evals.positive.length < 5 || evals.negative.length < 3) {
  throw new Error("Phase 3 requires at least five positive and three negative eval cases.");
}

const cases = [...evals.positive, ...evals.negative];
const ids = new Set();
for (const testCase of cases) {
  if (ids.has(testCase.id)) throw new Error(`Duplicate eval ID: ${testCase.id}`);
  ids.add(testCase.id);
  if (!testCase.prompt || !testCase.expectedBehavior) {
    throw new Error(`Eval ${testCase.id} needs a prompt and expected behavior.`);
  }
  for (const tool of testCase.expectedTools) {
    if (!toolNames.has(tool)) throw new Error(`Eval ${testCase.id} names unknown tool ${tool}.`);
  }
}

for (const testCase of evals.negative) {
  if (testCase.expectedTools.some((tool) => mutationTools.has(tool))) {
    throw new Error(`Negative eval ${testCase.id} cannot expect a mutation tool.`);
  }
  if (!testCase.reason) throw new Error(`Negative eval ${testCase.id} needs a reason.`);
}

console.log(
  `Validated ${evals.positive.length} positive and ${evals.negative.length} negative Phase 3 evals.`,
);
