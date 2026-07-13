"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="status-page">
      <p className="status-page__kicker">SYSTEM / ERROR</p>
      <h1>This page encountered an unexpected interface error.</h1>
      <p>This screen does not determine transaction status. Check the wallet or explorer before retrying any write, then reload the page.</p>
      <Button onClick={reset}>Retry</Button>
    </section>
  );
}
