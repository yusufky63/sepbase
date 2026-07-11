"use client";

import { Check, CircleSlash2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { projectConfig } from "@/config/project.config";
import { protocolDeployed } from "@/lib/deployment-manifest";
import { normalizeLabel } from "@/lib/name-normalization";
import { useNameAvailability } from "@/lib/contract/hooks";
import styles from "./name-search.module.css";

export function NameSearch() {
  const [input, setInput] = useState("");
  const router = useRouter();
  const normalized = useMemo(
    () => normalizeLabel(input, projectConfig.brand.suffix),
    [input],
  );
  const availability = useNameAvailability(normalized.label, normalized.valid);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (normalized.valid) router.push(`/name/${encodeURIComponent(normalized.label)}`);
  }

  let state = "Enter a name to check availability.";
  let stateKind: "idle" | "good" | "bad" = "idle";
  if (input && !normalized.valid) {
    state = normalized.reason ?? "Invalid name.";
    stateKind = "bad";
  } else if (normalized.valid && !protocolDeployed) {
    state = "Registration is not available on this network yet.";
  } else if (availability.isLoading) {
    state = "Checking availability...";
  } else if (availability.isError) {
    state = "Availability could not be checked. Try again.";
    stateKind = "bad";
  } else if (availability.data === true) {
    state = `${normalized.fullName} is available.`;
    stateKind = "good";
  } else if (availability.data === false) {
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
          maxLength={projectConfig.names.maxLength + projectConfig.brand.suffix.length + 1}
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
