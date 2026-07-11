import Link from "next/link";

export default function NotFound() {
  return (
    <section className="status-page">
      <p className="status-page__kicker">404 / NOT FOUND</p>
      <h1>This module does not exist.</h1>
      <p>The address may be incomplete, expired, or outside this registry.</p>
      <Link href="/" className="status-page__link">Return to name search</Link>
    </section>
  );
}
