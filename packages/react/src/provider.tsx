"use client";

import {
  createSepbaseClient,
  type CreateSepbaseClientOptions,
  type SepbaseClient,
  type VerifiedAddressIdentity,
} from "@sepbase/sdk";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { getAddress, isAddress } from "viem";

export type SepbaseIdentityClient = Pick<SepbaseClient, "verifyAddress">;

type ProviderState = {
  client: SepbaseIdentityClient | null;
  error: Error | null;
  loading: boolean;
};

type ClientProviderProps = {
  children: ReactNode;
  client: SepbaseIdentityClient;
  manifestUrl?: never;
  rpcUrl?: never;
  fetcher?: never;
  allowedManifestOrigins?: never;
  allowedRpcOrigins?: never;
};

type ManifestProviderProps = {
  children: ReactNode;
  client?: never;
  manifestUrl: string | URL;
  rpcUrl?: string;
  fetcher?: typeof fetch;
  allowedManifestOrigins?: readonly string[];
  allowedRpcOrigins?: readonly string[];
};

export type SepbaseProviderProps = ClientProviderProps | ManifestProviderProps;

const SepbaseContext = createContext<ProviderState | null>(null);

export function SepbaseProvider(props: SepbaseProviderProps) {
  const directClient = props.client;
  const manifestUrl = "manifestUrl" in props ? props.manifestUrl.toString() : null;
  const rpcUrl = "rpcUrl" in props ? props.rpcUrl : undefined;
  const fetcher = "fetcher" in props ? props.fetcher : undefined;
  const allowedManifestOrigins = "allowedManifestOrigins" in props ? props.allowedManifestOrigins : undefined;
  const allowedRpcOrigins = "allowedRpcOrigins" in props ? props.allowedRpcOrigins : undefined;
  const [state, setState] = useState<ProviderState>(() => ({
    client: directClient ?? null,
    error: null,
    loading: !directClient,
  }));

  useEffect(() => {
    if (directClient) {
      setState({ client: directClient, error: null, loading: false });
      return;
    }
    if (!manifestUrl) return;
    let active = true;
    setState({ client: null, error: null, loading: true });
    const options: CreateSepbaseClientOptions = {
      manifestUrl,
      ...(rpcUrl ? { rpcUrl } : {}),
      ...(fetcher ? { fetcher } : {}),
      ...(allowedManifestOrigins ? { allowedManifestOrigins } : {}),
      ...(allowedRpcOrigins ? { allowedRpcOrigins } : {}),
    };
    void createSepbaseClient(options).then(
      (client) => {
        if (active) setState({ client, error: null, loading: false });
      },
      (error: unknown) => {
        if (active) {
          setState({
            client: null,
            error: error instanceof Error ? error : new Error("SEPBASE client initialization failed."),
            loading: false,
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [allowedManifestOrigins, allowedRpcOrigins, directClient, fetcher, manifestUrl, rpcUrl]);

  return <SepbaseContext.Provider value={state}>{props.children}</SepbaseContext.Provider>;
}

export type SepbaseIdentityState = {
  identity: VerifiedAddressIdentity | null;
  error: Error | null;
  status: "loading" | "verified" | "unverified" | "error";
  refresh(): void;
};

export function useSepbaseIdentity(address: string): SepbaseIdentityState {
  const context = useContext(SepbaseContext);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Omit<SepbaseIdentityState, "refresh">>({
    identity: null,
    error: null,
    status: "loading",
  });

  useEffect(() => {
    if (!context) return;
    if (context.loading) {
      setResult({ identity: null, error: null, status: "loading" });
      return;
    }
    if (context.error) {
      setResult({ identity: null, error: context.error, status: "error" });
      return;
    }
    if (!context.client || !isAddress(address)) {
      setResult({ identity: null, error: new Error("A valid EVM address is required."), status: "error" });
      return;
    }
    let active = true;
    setResult({ identity: null, error: null, status: "loading" });
    void context.client.verifyAddress(getAddress(address)).then(
      (identity) => {
        if (active) {
          setResult({
            identity,
            error: null,
            status: identity.verified ? "verified" : "unverified",
          });
        }
      },
      (error: unknown) => {
        if (active) {
          setResult({
            identity: null,
            error: error instanceof Error ? error : new Error("SEPBASE identity verification failed."),
            status: "error",
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [address, context, revision]);

  if (!context) throw new Error("useSepbaseIdentity must be used inside SepbaseProvider.");

  return {
    ...result,
    refresh: () => setRevision((current) => current + 1),
  };
}
