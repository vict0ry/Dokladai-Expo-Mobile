import React, { createContext, useContext, useState, useEffect } from "react";
import { Platform } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface NetworkContextType {
  isConnected: boolean;
  lastVisitedUrl: string | null;
  saveCurrentUrl: (url: string) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  lastVisitedUrl: null,
  saveCurrentUrl: () => {},
});

export function useNetwork() {
  return useContext(NetworkContext);
}

const LAST_URL_KEY = "doklad_last_url";

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [lastVisitedUrl, setLastVisitedUrl] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LAST_URL_KEY).then((url) => {
      if (url) setLastVisitedUrl(url);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(!!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  function saveCurrentUrl(url: string) {
    setLastVisitedUrl(url);
    AsyncStorage.setItem(LAST_URL_KEY, url);
  }

  return (
    <NetworkContext.Provider
      value={{
        isConnected,
        lastVisitedUrl,
        saveCurrentUrl,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}
