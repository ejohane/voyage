import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreatePlanInput,
  type CreateStayInput,
  type CreateTravelInput,
  type PlanListResponse,
  type PlanResponse,
  planEndpoint,
  type Stay,
  type StayListResponse,
  type StayResponse,
  stayEndpoint,
  type Travel,
  type TravelListResponse,
  type TravelResponse,
  type TripPlan,
  travelEndpoint,
  tripPlansEndpoint,
  tripStaysEndpoint,
  tripTravelEndpoint,
  type UpdatePlanInput,
  type UpdateStayInput,
  type UpdateTravelInput,
} from "@voyage/contracts";
import { useApiRequest } from "@/lib/api";

const planningKeys = {
  travel: (tripId: string) => ["trips", tripId, "travel"] as const,
  stays: (tripId: string) => ["trips", tripId, "stays"] as const,
  plans: (tripId: string) => ["trips", tripId, "plans"] as const,
};

function sortPlans(plans: TripPlan[]) {
  return plans.sort((left, right) => {
    const leftSchedule = `${left.scheduledDate ?? "9999-12-31"}T${left.startTime ?? "99:99"}`;
    const rightSchedule = `${right.scheduledDate ?? "9999-12-31"}T${right.startTime ?? "99:99"}`;
    return (
      leftSchedule.localeCompare(rightSchedule) || left.createdAt.localeCompare(right.createdAt)
    );
  });
}

function useTravel(tripId: string) {
  const request = useApiRequest();

  return useQuery({
    queryKey: planningKeys.travel(tripId),
    queryFn: async () => (await request<TravelListResponse>(tripTravelEndpoint(tripId))).travel,
    enabled: Boolean(tripId),
  });
}

function useStays(tripId: string) {
  const request = useApiRequest();

  return useQuery({
    queryKey: planningKeys.stays(tripId),
    queryFn: async () => (await request<StayListResponse>(tripStaysEndpoint(tripId))).stays,
    enabled: Boolean(tripId),
  });
}

function usePlans(tripId: string) {
  const request = useApiRequest();

  return useQuery({
    queryKey: planningKeys.plans(tripId),
    queryFn: async () => (await request<PlanListResponse>(tripPlansEndpoint(tripId))).plans,
    enabled: Boolean(tripId),
  });
}

function useCreateTravel(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTravelInput) =>
      (
        await request<TravelResponse>(tripTravelEndpoint(tripId), {
          method: "POST",
          body: JSON.stringify(input),
        })
      ).travel,
    onSuccess: (travel) => {
      queryClient.setQueryData<Travel[]>(planningKeys.travel(tripId), (items = []) =>
        [...items, travel].sort((left, right) => left.departureAt.localeCompare(right.departureAt)),
      );
    },
  });
}

function useUpdateTravel(tripId: string, travelId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTravelInput) =>
      (
        await request<TravelResponse>(travelEndpoint(tripId, travelId), {
          method: "PATCH",
          body: JSON.stringify(input),
        })
      ).travel,
    onSuccess: (travel) => {
      queryClient.setQueryData<Travel[]>(planningKeys.travel(tripId), (items = []) =>
        items
          .map((item) => (item.id === travel.id ? travel : item))
          .sort((left, right) => left.departureAt.localeCompare(right.departureAt)),
      );
    },
  });
}

function useDeleteTravel(tripId: string, travelId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      request<void>(travelEndpoint(tripId, travelId), {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.setQueryData<Travel[]>(planningKeys.travel(tripId), (items = []) =>
        items.filter((item) => item.id !== travelId),
      );
    },
  });
}

function useCreateStay(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateStayInput) =>
      (
        await request<StayResponse>(tripStaysEndpoint(tripId), {
          method: "POST",
          body: JSON.stringify(input),
        })
      ).stay,
    onSuccess: (stay) => {
      queryClient.setQueryData<Stay[]>(planningKeys.stays(tripId), (items = []) =>
        [...items, stay].sort((left, right) => left.checkInDate.localeCompare(right.checkInDate)),
      );
    },
  });
}

function useUpdateStay(tripId: string, stayId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateStayInput) =>
      (
        await request<StayResponse>(stayEndpoint(tripId, stayId), {
          method: "PATCH",
          body: JSON.stringify(input),
        })
      ).stay,
    onSuccess: (stay) => {
      queryClient.setQueryData<Stay[]>(planningKeys.stays(tripId), (items = []) =>
        items
          .map((item) => (item.id === stay.id ? stay : item))
          .sort((left, right) => left.checkInDate.localeCompare(right.checkInDate)),
      );
    },
  });
}

function useDeleteStay(tripId: string, stayId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => request<void>(stayEndpoint(tripId, stayId), { method: "DELETE" }),
    onSuccess: () => {
      queryClient.setQueryData<Stay[]>(planningKeys.stays(tripId), (items = []) =>
        items.filter((item) => item.id !== stayId),
      );
    },
  });
}

function useCreatePlan(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePlanInput) =>
      (
        await request<PlanResponse>(tripPlansEndpoint(tripId), {
          method: "POST",
          body: JSON.stringify(input),
        })
      ).plan,
    onSuccess: (plan) => {
      queryClient.setQueryData<TripPlan[]>(planningKeys.plans(tripId), (items = []) =>
        sortPlans([...items, plan]),
      );
    },
  });
}

function useUpdatePlan(tripId: string, planId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePlanInput) =>
      (
        await request<PlanResponse>(planEndpoint(tripId, planId), {
          method: "PATCH",
          body: JSON.stringify(input),
        })
      ).plan,
    onSuccess: (plan) => {
      queryClient.setQueryData<TripPlan[]>(planningKeys.plans(tripId), (items = []) =>
        sortPlans(items.map((item) => (item.id === plan.id ? plan : item))),
      );
    },
  });
}

function useDeletePlan(tripId: string, planId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => request<void>(planEndpoint(tripId, planId), { method: "DELETE" }),
    onSuccess: () => {
      queryClient.setQueryData<TripPlan[]>(planningKeys.plans(tripId), (items = []) =>
        items.filter((item) => item.id !== planId),
      );
    },
  });
}

export {
  useCreatePlan,
  useCreateStay,
  useCreateTravel,
  useDeletePlan,
  useDeleteStay,
  useDeleteTravel,
  usePlans,
  useStays,
  useTravel,
  useUpdatePlan,
  useUpdateStay,
  useUpdateTravel,
};
