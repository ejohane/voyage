import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateStayInput,
  type CreateTravelInput,
  type Stay,
  type StayListResponse,
  type StayResponse,
  stayEndpoint,
  type Travel,
  type TravelListResponse,
  type TravelResponse,
  travelEndpoint,
  tripStaysEndpoint,
  tripTravelEndpoint,
  type UpdateStayInput,
  type UpdateTravelInput,
} from "@voyage/contracts";
import { useApiRequest } from "@/lib/api";

const planningKeys = {
  travel: (tripId: string) => ["trips", tripId, "travel"] as const,
  stays: (tripId: string) => ["trips", tripId, "stays"] as const,
};

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

export {
  useCreateStay,
  useCreateTravel,
  useDeleteStay,
  useDeleteTravel,
  useStays,
  useTravel,
  useUpdateStay,
  useUpdateTravel,
};
