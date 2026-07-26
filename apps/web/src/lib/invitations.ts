import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptInvitationEndpoint,
  type CreateInvitationInput,
  type CreateInvitationResponse,
  copyTripInvitationLinkEndpoint,
  declineInvitationEndpoint,
  type InvitationActionResponse,
  type InvitationLinkResponse,
  type InvitationSummaryResponse,
  invitationEndpoint,
  resendTripInvitationEndpoint,
  type TripPeopleResponse,
  tripInvitationEndpoint,
  tripInvitationsEndpoint,
  tripMemberEndpoint,
  tripPeopleEndpoint,
} from "@voyage/contracts";
import { useApiRequest } from "@/lib/api";

const peopleKeys = {
  detail: (tripId: string) => ["trip-people", tripId] as const,
  invitation: (token: string) => ["invitation", token] as const,
};

async function publicRequest<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok)
    throw new Error(
      response.status === 404 ? "Invitation not found." : "Unable to load invitation.",
    );
  return (await response.json()) as T;
}

function useTripPeople(tripId: string) {
  const request = useApiRequest();
  return useQuery({
    queryKey: peopleKeys.detail(tripId),
    queryFn: () => request<TripPeopleResponse>(tripPeopleEndpoint(tripId)),
    enabled: Boolean(tripId),
  });
}

function useCreateInvitation(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) =>
      request<CreateInvitationResponse>(tripInvitationsEndpoint(tripId), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.detail(tripId) }),
  });
}

function useResendInvitation(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      request<CreateInvitationResponse>(resendTripInvitationEndpoint(tripId, invitationId), {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.detail(tripId) }),
  });
}

function useCopyInvitationLink(tripId: string) {
  const request = useApiRequest();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await request<InvitationLinkResponse>(
        copyTripInvitationLinkEndpoint(tripId, invitationId),
        { method: "POST" },
      );
      await navigator.clipboard.writeText(response.invitationUrl);
      return response;
    },
  });
}

function useRevokeInvitation(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      request<void>(tripInvitationEndpoint(tripId, invitationId), { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.detail(tripId) }),
  });
}

function useRemoveTripMember(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      request<void>(tripMemberEndpoint(tripId, userId), { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.detail(tripId) }),
  });
}

function useInvitation(token: string) {
  return useQuery({
    queryKey: peopleKeys.invitation(token),
    queryFn: async () =>
      (await publicRequest<InvitationSummaryResponse>(invitationEndpoint(token))).invitation,
    enabled: Boolean(token),
    retry: false,
  });
}

function useAcceptInvitation(token: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<InvitationActionResponse>(acceptInvitationEndpoint(token), { method: "POST" }),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["trips"] });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.invitation(token) });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.detail(response.tripId) });
    },
  });
}

function useDeclineInvitation(token: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<InvitationActionResponse>(declineInvitationEndpoint(token), { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.invitation(token) }),
  });
}

export {
  useAcceptInvitation,
  useCopyInvitationLink,
  useCreateInvitation,
  useDeclineInvitation,
  useInvitation,
  useRemoveTripMember,
  useResendInvitation,
  useRevokeInvitation,
  useTripPeople,
};
