import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateResearchItemRequest,
  type ResearchItem,
  type ResearchItemResponse,
  type ResearchListResponse,
  type ResearchPlanPromotionInput,
  type ResearchPlanPromotionResponse,
  researchItemEndpoint,
  researchPlanPromotionEndpoint,
  tripResearchEndpoint,
  type UpdateResearchItemInput,
} from "@voyage/contracts";
import { useApiRequest } from "@/lib/api";

const researchKeys = {
  list: (tripId: string) => ["trips", tripId, "research"] as const,
};

function newestFirst(items: ResearchItem[]) {
  return [...items].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
  );
}

function useResearch(tripId: string, enabled = true) {
  const request = useApiRequest();
  return useQuery({
    queryKey: researchKeys.list(tripId),
    queryFn: async () =>
      (await request<ResearchListResponse>(tripResearchEndpoint(tripId))).researchItems,
    enabled: Boolean(tripId) && enabled,
  });
}

function useCreateResearch(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateResearchItemRequest) =>
      (
        await request<ResearchItemResponse>(tripResearchEndpoint(tripId), {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(input),
        })
      ).researchItem,
    onSuccess: (item) => {
      queryClient.setQueryData<ResearchItem[]>(researchKeys.list(tripId), (items = []) =>
        newestFirst([item, ...items.filter((current) => current.id !== item.id)]),
      );
    },
  });
}

function useUpdateResearch(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, input }: { item: ResearchItem; input: UpdateResearchItemInput }) =>
      (
        await request<ResearchItemResponse>(researchItemEndpoint(tripId, item.id), {
          method: "PATCH",
          headers: { "If-Match": `"${item.revision}"` },
          body: JSON.stringify(input),
        })
      ).researchItem,
    onSuccess: (item) => {
      queryClient.setQueryData<ResearchItem[]>(researchKeys.list(tripId), (items = []) =>
        newestFirst(items.map((current) => (current.id === item.id ? item : current))),
      );
    },
  });
}

function useDeleteResearch(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: ResearchItem) => {
      await request<void>(researchItemEndpoint(tripId, item.id), {
        method: "DELETE",
        headers: { "If-Match": `"${item.revision}"` },
      });
      return item.id;
    },
    onSuccess: (itemId) => {
      queryClient.setQueryData<ResearchItem[]>(researchKeys.list(tripId), (items = []) =>
        items.filter((item) => item.id !== itemId),
      );
    },
  });
}

function usePromoteResearchToPlan(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      item,
      input,
    }: {
      item: ResearchItem;
      input: ResearchPlanPromotionInput;
    }) =>
      request<ResearchPlanPromotionResponse>(researchPlanPromotionEndpoint(tripId, item.id), {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "If-Match": `"${item.revision}"`,
        },
        body: JSON.stringify(input),
      }),
    onSuccess: ({ researchItem, plan }) => {
      queryClient.setQueryData<ResearchItem[]>(researchKeys.list(tripId), (items = []) =>
        newestFirst(
          items.map((current) => (current.id === researchItem.id ? researchItem : current)),
        ),
      );
      queryClient.setQueryData(["trips", tripId, "plans"], (current: unknown) =>
        Array.isArray(current) ? [...current, plan] : [plan],
      );
    },
  });
}

export {
  researchKeys,
  useCreateResearch,
  useDeleteResearch,
  usePromoteResearchToPlan,
  useResearch,
  useUpdateResearch,
};
