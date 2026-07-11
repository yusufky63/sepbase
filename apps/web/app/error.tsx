"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="status-page">
      <p className="status-page__kicker">SYSTEM / ERROR</p>
      <h1>The interface could not finish this request.</h1>
      <p>The request could not be completed. No name status was changed; retry when you are ready.</p>
      <Button onClick={reset}>Retry</Button>
    </section>
  );
}
