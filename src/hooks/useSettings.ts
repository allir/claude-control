import useSWR from "swr";

interface SettingsConfig {
  notifications: boolean;
  notificationSound: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSettings() {
  const { data } = useSWR<{ config: SettingsConfig }>("/api/settings", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 0, // Only fetch once, revalidate on mutation
  });

  return {
    notifications: data?.config?.notifications ?? true,
    notificationSound: data?.config?.notificationSound ?? true,
  };
}
