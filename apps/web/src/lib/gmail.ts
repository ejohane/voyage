import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type GmailConnectInput,
  type GmailConnection,
  type GmailConnectResponse,
  type GmailImportCandidate,
  type GmailImportResponse,
  type GmailScanResponse,
  gmailConnectEndpoint,
  gmailIntegrationEndpoint,
  tripGmailImportEndpoint,
  tripGmailScanEndpoint,
} from "@voyage/contracts";
import { useApiRequest } from "@/lib/api";

const gmailKeys = {
  connection: ["gmail", "connection"] as const,
};

function useGmailConnection() {
  const request = useApiRequest();
  return useQuery({
    queryKey: gmailKeys.connection,
    queryFn: () => request<GmailConnection>(gmailIntegrationEndpoint),
  });
}

function useConnectGmail() {
  const request = useApiRequest();
  return useMutation({
    mutationFn: (input: GmailConnectInput) =>
      request<GmailConnectResponse>(gmailConnectEndpoint(), {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

function useDisconnectGmail() {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request<void>(gmailIntegrationEndpoint, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.setQueryData<GmailConnection>(gmailKeys.connection, { connected: false }),
  });
}

function useScanGmail(tripId: string) {
  const request = useApiRequest();
  return useMutation({
    mutationFn: () => request<GmailScanResponse>(tripGmailScanEndpoint(tripId), { method: "POST" }),
  });
}

function useImportGmail(tripId: string) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidates: GmailImportCandidate[]) =>
      request<GmailImportResponse>(tripGmailImportEndpoint(tripId), {
        method: "POST",
        body: JSON.stringify({ candidates }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trips", tripId, "travel"] }),
        queryClient.invalidateQueries({ queryKey: ["trips", tripId, "stays"] }),
      ]);
    },
  });
}

export { useConnectGmail, useDisconnectGmail, useGmailConnection, useImportGmail, useScanGmail };
