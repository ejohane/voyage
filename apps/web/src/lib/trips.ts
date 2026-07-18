import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateTripInput,
  type Trip,
  type TripListResponse,
  type TripResponse,
  tripEndpoint,
  tripsEndpoint,
  type UpdateTripInput,
} from "@voyage/contracts";
import { useApiRequest } from "@/lib/api";

const tripKeys = {
  all: ["trips"] as const,
  detail: (tripId: string) => ["trips", tripId] as const,
};

function useTrips() {
  const request = useApiRequest();

  return useQuery({
    queryKey: tripKeys.all,
    queryFn: async () => (await request<TripListResponse>(tripsEndpoint)).trips,
  });
}

function useTrip(tripId: string) {
  const request = useApiRequest();

  return useQuery({
    queryKey: tripKeys.detail(tripId),
    queryFn: async () => (await request<TripResponse>(tripEndpoint(tripId))).trip,
    enabled: Boolean(tripId),
  });
}

function useCreateTrip() {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTripInput) =>
      (
        await request<TripResponse>(tripsEndpoint, {
          method: "POST",
          body: JSON.stringify(input),
        })
      ).trip,
    onSuccess: (trip) => {
      queryClient.setQueryData<Trip[]>(tripKeys.all, (trips = []) => [trip, ...trips]);
      queryClient.setQueryData(tripKeys.detail(trip.id), trip);
    },
  });
}

function useUpdateTrip(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTripInput) =>
      (
        await request<TripResponse>(tripEndpoint(tripId), {
          method: "PATCH",
          body: JSON.stringify(input),
        })
      ).trip,
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(trip.id), trip);
      queryClient.setQueryData<Trip[]>(tripKeys.all, (trips) =>
        trips?.map((candidate) => (candidate.id === trip.id ? trip : candidate)),
      );
      void queryClient.invalidateQueries({ queryKey: tripKeys.all });
    },
  });
}

export { useCreateTrip, useTrip, useTrips, useUpdateTrip };
