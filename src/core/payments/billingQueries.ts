import { QueryClient } from "@tanstack/react-query";

export const BILLING_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  retry: 1,
};

export async function refreshBillingQueries(
  queryClient: QueryClient,
  countryCode?: string
) {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const first = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
      return (
        typeof first === "string" &&
        (first.includes("payments") ||
          first.includes("pricing") ||
          first.includes("dashboard") ||
          first.includes("account"))
      );
    },
  });

  if (countryCode) {
    await Promise.all([
      queryClient.refetchQueries({
        queryKey: ["payments-overview", countryCode],
        type: "active",
      }),
      queryClient.refetchQueries({
        queryKey: ["payments-plan-catalog", countryCode],
        type: "active",
      }),
      queryClient.refetchQueries({
        queryKey: ["payments-subscription-current", countryCode],
        type: "active",
      }),
      queryClient.refetchQueries({
        queryKey: ["payments-topups-catalog", countryCode],
        type: "active",
      }),
    ]);
  }
}
