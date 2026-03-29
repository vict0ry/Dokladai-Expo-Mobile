import React, { createContext, useContext, useState, useEffect } from "react";
import { Platform } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface NetworkContextType {
  isConnected: boolean;
  lastVisitedUrl: string | null;
  lastPageTitle: string | null;
  saveCurrentUrl: (url: string, title?: string) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  lastVisitedUrl: null,
  lastPageTitle: null,
  saveCurrentUrl: () => {},
});

export function useNetwork() {
  return useContext(NetworkContext);
}

const LAST_URL_KEY = "doklad_last_url";
const LAST_TITLE_KEY = "doklad_last_title";

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [lastVisitedUrl, setLastVisitedUrl] = useState<string | null>(null);
  const [lastPageTitle, setLastPageTitle] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LAST_URL_KEY).then((url) => {
      if (url) setLastVisitedUrl(url);
    });
    AsyncStorage.getItem(LAST_TITLE_KEY).then((title) => {
      if (title) setLastPageTitle(title);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(!!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  function saveCurrentUrl(url: string, title?: string) {
    setLastVisitedUrl(url);
    AsyncStorage.setItem(LAST_URL_KEY, url);
    if (title) {
      setLastPageTitle(title);
      AsyncStorage.setItem(LAST_TITLE_KEY, title);
    }
  }

  return (
    <NetworkContext.Provider
      value={{
        isConnected,
        lastVisitedUrl,
        lastPageTitle,
        saveCurrentUrl,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}
