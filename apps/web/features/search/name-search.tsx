"use client";

import { normalizeName } from "@sepbase/sdk";
import { Check, CircleSlash2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { projectConfig } from "@/config/project.config";
import { protocolDeployed } from "@/lib/deployment-manifest";
import { normalizeLabel } from "@/lib/name-normalization";
import { useNameAvailability } from "@/lib/contract/hooks";
import { getV3BrowserClient, isV3ManifestOperational, v3BrowserManifest } from "@/lib/v3-browser-runtime";
import styles from "./name-search.module.css";

type StoredV3Availability =
  | { key: string; status: "ready"; available: boolean }
  | { key: string; status: "error" };

function normalizeSearchInput(input: string, v3Operational: boolean) {
  if (!v3Operational) return normalizeLabel(input, projectConfig.brand.suffix);
  try {
    const normalized = normalizeName(input, v3BrowserManifest.suffix, {
      minCodePoints: v3BrowserManifest.nameRules.minCodepoints,
      maxCodePoints: v3BrowserManifest.nameRules.maxCodepoints,
      maxUtf8Bytes: v3BrowserManifest.nameRules.maxUtf8Bytes,
    });
    return {
      label: normalized.normalizedLabel,
      fullName: normalized.normalizedFullName,
      valid: true,
      reason: null,
    };
  } catch (error) {
    return {
      label: "",
      fullName: `.${v3BrowserManifest.suffix}`,
      valid: false,
      reason: error instanceof Error ? error.message : "Invalid ENSIP-15 name.",
    };
  }
}

export function NameSearch() {
  const [input, setInput] = useState("");
  const [storedV3Availability, setStoredV3Availability] = useState<StoredV3Availability | null>(null);
  const router = useRouter();
  const v3Operational = isV3ManifestOperational();
  const normalized = useMemo(
    () => normalizeSearchInput(input, v3Operational),
    [input, v3Operational],
  );
  const availability = useNameAvailability(normalized.label, normalized.valid && !v3Operational);
  const v3AvailabilityKey = `${v3BrowserManifest.suiteReleaseId}:${normalized.label}`;
  const v3Availability = !v3Operational || !normalized.valid
    ? { status: "idle" as const }
    : storedV3Availability?.key === v3AvailabilityKey
      ? storedV3Availability
      : { status: "loading" as const };

  useEffect(() => {
    if (!v3Operational || !normalized.valid) return;
    let active = true;
    void getV3BrowserClient()
      .then((client) => client.getNameRecord(normalized.label))
      .then(
        (record) => {
          if (active) setStoredV3Availability({ key: v3AvailabilityKey, status: "ready", available: record.available });
        },
        () => {
          if (active) setStoredV3Availability({ key: v3AvailabilityKey, status: "error" });
        },
      );
    return () => { active = false; };
  }, [normalized.label, normalized.valid, v3AvailabilityKey, v3Operational]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (normalized.valid) router.push(`/name/${encodeURIComponent(normalized.label)}`);
  }

  let state = "Enter a name to check availability.";
  let stateKind: "idle" | "good" | "bad" = "idle";
  if (input && !normalized.valid) {
    state = normalized.reason ?? "Invalid name.";
    stateKind = "bad";
  } else if (normalized.valid && !protocolDeployed && !v3Operational) {
    state = "Registration is not available on this network yet.";
  } else if (v3Operational && v3Availability.status === "loading") {
    state = "Checking V3 availability at a verified block...";
  } else if (v3Operational && v3Availability.status === "error") {
    state = "V3 availability could not be verified. Try again.";
    stateKind = "bad";
  } else if (v3Operational && v3Availability.status === "ready" && v3Availability.available) {
    state = `${normalized.fullName} is available.`;
    stateKind = "good";
  } else if (v3Operational && v3Availability.status === "ready") {
    state = `${normalized.fullName} is already registered or reserved.`;
    stateKind = "bad";
  } else if (!v3Operational && availability.isLoading) {
    state = "Checking availability...";
  } else if (!v3Operational && availability.isError) {
    state = "Availability could not be checked. Try again.";
    stateKind = "bad";
  } else if (!v3Operational && availability.data === true) {
    state = `${normalized.fullName} is available.`;
    stateKind = "good";
  } else if (!v3Operational && availability.data === false) {
    state = `${normalized.fullName} is already registered or reserved.`;
    stateKind = "bad";
  }

  return (
    <form className={styles.search} onSubmit={submit} noValidate>
      <label htmlFor="name-search" className="srOnly">
        Search a .{projectConfig.brand.suffix} name
      </label>
      <div className={styles.control}>
        <span className={styles.index}>01</span>
        <input
          id="name-search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="alice"
          autoComplete="off"
          spellCheck={false}
          maxLength={v3Operational
            ? v3BrowserManifest.nameRules.maxUtf8Bytes + v3BrowserManifest.suffix.length + 1
            : projectConfig.names.maxLength + projectConfig.brand.suffix.length + 1}
        />
        <span className={styles.suffix}>.{projectConfig.brand.suffix}</span>
        <button type="submit" disabled={!normalized.valid} aria-label="Open name">
          <Search size={24} aria-hidden="true" />
        </button>
      </div>
      <div className={`${styles.state} ${styles[stateKind]}`} aria-live="polite">
        {stateKind === "good" ? <Check size={16} /> : stateKind === "bad" ? <CircleSlash2 size={16} /> : null}
        <span>{state}</span>
      </div>
    </form>
  );
}
