"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut } from "lucide-react";

type WalletState = {
  connected: boolean;
  publicKey: string | null;
  error: string | null;
};

export function WalletConnect() {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    publicKey: null,
    error: null,
  });
  const [loading, setLoading] = useState(false);

  // Check if Freighter is available and already connected
  const checkConnection = useCallback(async () => {
    try {
      // Freighter API v6: window.freighterApi is the global object
      if (typeof window === "undefined" || !(window as any).freighterApi) {
        return;
      }

      const freighter = (window as any).freighterApi;
      const publicKey = await freighter.getPublicKey();

      if (publicKey) {
        setWallet({ connected: true, publicKey, error: null });
        localStorage.setItem("stellar_wallet_address", publicKey);
      }
    } catch {
      // User hasn't connected yet — that's fine
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connect = async () => {
    setLoading(true);
    setWallet((prev) => ({ ...prev, error: null }));

    try {
      const freighter = (window as any).freighterApi;

      if (!freighter) {
        throw new Error(
          "Freighter wallet is not installed. Please install the Freighter browser extension."
        );
      }

      const publicKey: string = await freighter.getPublicKey();

      if (!publicKey) {
        throw new Error("Failed to retrieve wallet address. Please try again.");
      }

      localStorage.setItem("stellar_wallet_address", publicKey);
      setWallet({ connected: true, publicKey, error: null });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect wallet";
      setWallet((prev) => ({
        ...prev,
        error: message,
      }));
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    localStorage.removeItem("stellar_wallet_address");
    setWallet({ connected: false, publicKey: null, error: null });
  };

  const truncateKey = (key: string): string => {
    if (key.length <= 10) return key;
    return `${key.slice(0, 5)}...${key.slice(-4)}`;
  };

  // Error state
  if (wallet.error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-destructive max-w-[200px]">{wallet.error}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={connect} disabled={loading}>
            {loading ? "Connecting..." : "Retry"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWallet((prev) => ({ ...prev, error: null }))}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  // Connected state
  if (wallet.connected && wallet.publicKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground font-mono">
          {truncateKey(wallet.publicKey)}
        </span>
        <Button variant="ghost" size="icon" onClick={disconnect} title="Disconnect Wallet">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Disconnected state
  return (
    <Button onClick={connect} disabled={loading} variant="outline">
      <Wallet className="mr-2 h-4 w-4" />
      {loading ? "Connecting..." : "Connect Wallet"}
    </Button>
  );
}