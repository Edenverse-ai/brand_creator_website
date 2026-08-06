import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface HeroCopy {
  kicker: string;
  /** Headline before the accented word */
  titleLead: string;
  /** Word rendered in the hero gradient */
  titleAccent: string;
  subtitle: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
}

const NOISE_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E";

export default function HeroSection({ copy }: { copy: HeroCopy }) {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-surface">
      {/* grain + soft accent atmosphere — hero only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: `url("${NOISE_URI}")` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] h-[480px] w-[480px] rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-4 py-[--space-section] sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <p className="reveal-up is-visible text-micro font-medium uppercase tracking-micro text-accent">
            {copy.kicker}
          </p>
          <h1
            id="hero-heading"
            className="hero-clip-reveal mt-6 font-display text-hero font-semibold text-ink"
          >
            {copy.titleLead}{" "}
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              {copy.titleAccent}
            </span>
          </h1>
          <p className="mt-8 max-w-2xl text-xl leading-[--leading-body] text-ink-muted">
            {copy.subtitle}
          </p>
          <div className="mt-12 flex flex-col gap-4 sm:flex-row">
            <Link
              href={copy.primaryCta.href}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-accent px-8 py-4 text-base font-semibold text-accent-contrast shadow-raised transition-colors duration-fast hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {copy.primaryCta.label}
              <ArrowRight className="h-5 w-5 transition-transform duration-fast group-hover:translate-x-1" />
            </Link>
            <Link
              href={copy.secondaryCta.href}
              className="inline-flex items-center justify-center rounded-full border border-line bg-surface-raised px-8 py-4 text-base font-semibold text-ink transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {copy.secondaryCta.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
