"use client";

import {
  createSepbaseV3Client,
  type SepbaseV3Client,
  type V3AddressVerification,
} from "@sepbase/sdk";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { getAddress, isAddress } from "viem";

export type SepbaseV3IdentityClient = Pick<SepbaseV3Client, "verifyAddress">;

type ProviderState = {
  client: SepbaseV3IdentityClient | null;
  error: Error | null;
  loading: boolean;
};

type ClientProviderProps = {
  children: ReactNode;
  client: SepbaseV3IdentityClient;
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

export type SepbaseV3ProviderProps = ClientProviderProps | ManifestProviderProps;

const SepbaseV3Context = createContext<ProviderState | null>(null);

export function SepbaseV3Provider(props: SepbaseV3ProviderProps) {
  const directClient = props.client;
  const manifestUrl = "manifestUrl" in props ? props.manifestUrl.toString() : null;
  const rpcUrl = "rpcUrl" in props ? props.rpcUrl : undefined;
  const fetcher = "fetcher" in props ? props.fetcher : undefined;
  const allowedManifestOrigins = "allowedManifestOrigins" in props
    ? props.allowedManifestOrigins
    : undefined;
  const allowedRpcOrigins = "allowedRpcOrigins" in props ? props.allowedRpcOrigins : undefined;
  const allowedManifestOriginsKey = allowedManifestOrigins?.join("\u0000") ?? "";
  const allowedRpcOriginsKey = allowedRpcOrigins?.join("\u0000") ?? "";
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
    void createSepbaseV3Client({
      manifestUrl,
      ...(rpcUrl ? { rpcUrl } : {}),
      ...(fetcher ? { fetcher } : {}),
      ...(allowedManifestOriginsKey
        ? { allowedManifestOrigins: allowedManifestOriginsKey.split("\u0000") }
        : {}),
      ...(allowedRpcOriginsKey
        ? { allowedRpcOrigins: allowedRpcOriginsKey.split("\u0000") }
        : {}),
    }).then(
      (client) => {
        if (active) setState({ client, error: null, loading: false });
      },
      (error: unknown) => {
        if (active) {
          setState({
            client: null,
            error: error instanceof Error
              ? error
              : new Error("SEPBASE V3 client initialization failed."),
            loading: false,
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [allowedManifestOriginsKey, allowedRpcOriginsKey, directClient, fetcher, manifestUrl, rpcUrl]);

  return <SepbaseV3Context.Provider value={state}>{props.children}</SepbaseV3Context.Provider>;
}

export type SepbaseV3IdentityState = {
  identity: V3AddressVerification | null;
  error: Error | null;
  status: "loading" | "verified" | "unverified" | "error";
  refresh(): void;
};

export function useSepbaseV3Identity(address: string): SepbaseV3IdentityState {
  const context = useContext(SepbaseV3Context);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Omit<SepbaseV3IdentityState, "refresh">>({
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
      setResult({
        identity: null,
        error: new Error("A valid EVM address is required."),
        status: "error",
      });
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
            error: error instanceof Error
              ? error
              : new Error("SEPBASE V3 identity verification failed."),
            status: "error",
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [address, context, revision]);

  if (!context) throw new Error("useSepbaseV3Identity must be used inside SepbaseV3Provider.");

  return {
    ...result,
    refresh: () => setRevision((current) => current + 1),
  };
}
