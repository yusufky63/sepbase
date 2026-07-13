"use client";

import { Check, Copy } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { IconButton } from "@/components/ui/button";
import styles from "./developer-docs.module.css";

export function CodeBlock({ code, language, inverse = false }: { code: string; language: string; inverse?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={`${styles.codeBlock} ${inverse ? styles.inverse : ""}`}>
      <div className={styles.codeToolbar}>
        <span>{language.toUpperCase()}</span>
        <IconButton label={copied ? "Code copied" : "Copy code"} onClick={() => void copy()}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        </IconButton>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

export type DeveloperExample = {
  id: string;
  label: string;
  language: string;
  code: string;
};

export function ExampleTabs({ examples }: { examples: readonly DeveloperExample[] }) {
  const [active, setActive] = useState(examples[0]?.id ?? "");
  const selected = examples.find((example) => example.id === active) ?? examples[0];
  if (!selected) return null;

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % examples.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + examples.length) % examples.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = examples.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = examples[nextIndex];
    if (!next) return;
    setActive(next.id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]
      ?.focus();
  }

  return (
    <div className={styles.examples}>
      <div className={styles.tabs} role="tablist" aria-label="Integration examples">
        {examples.map((example, index) => (
          <button
            id={`example-tab-${example.id}`}
            key={example.id}
            type="button"
            role="tab"
            aria-selected={selected.id === example.id}
            aria-controls={`example-panel-${example.id}`}
            tabIndex={selected.id === example.id ? 0 : -1}
            onClick={() => setActive(example.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            {example.label}
          </button>
        ))}
      </div>
      <div
        id={`example-panel-${selected.id}`}
        role="tabpanel"
        aria-labelledby={`example-tab-${selected.id}`}
        tabIndex={0}
      >
        <CodeBlock code={selected.code} language={selected.language} />
      </div>
    </div>
  );
}
