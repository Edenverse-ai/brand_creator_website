"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BarChart3, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import DigitalHumanSection from "@/components/home/DigitalHumanSection";
import HeroSection from "@/components/home/HeroSection";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";

const TIKTOK_VIDEOS = [
  {
    id: "7363002417560046891",
    username: "@thekfamily33",
    description: "Family & Lifestyle Creator",
  },
  {
    id: "7411291540058017070",
    username: "@allure_fashion",
    description: "Fashion & Style Creator",
  },
  {
    id: "7469853284975660319",
    username: "@thehannahbrie",
    description: "Beauty & Lifestyle Creator",
  },
  { id: "7404220045376654634", username: "@jenny_claross", description: "Content Creator" },
  { id: "7389083054423264555", username: "@summerhemphill", description: "Lifestyle Creator" },
  {
    id: "7437194284459199790",
    username: "@mrs.hannahlong",
    description: "Family & Lifestyle Creator",
  },
];

const VIDEOS_PER_SLIDE = 3;

const CREATOR_VALUE_CARDS = [
  {
    stat: "12,000+",
    title: "campaigns every month",
    body: "Access thousands of brand opportunities across beauty, fashion, lifestyle, and beyond — updated daily.",
    link: { href: "/campaigns", label: "Explore campaigns" },
  },
  {
    stat: "Up to $5,000",
    title: "in bonus rewards",
    body: "Get rewarded for consistency. Complete 200 videos and earn exclusive cash bonuses on top of your payouts.",
    link: null,
  },
  {
    stat: "Personalized",
    title: "campaign matches & top rates",
    body: "We connect you with campaigns that suit your content — and ensure you get the best deal every time.",
    link: { href: "/how-it-works", label: "See how it works" },
  },
];

const FEATURES = [
  {
    icon: Search,
    title: "Smart Discovery",
    body: "Discover creators across TikTok that align with your brand values and target audience using our AI-powered matching system.",
  },
  {
    icon: Users,
    title: "Seamless Connection",
    body: "Easily connect with creators and start conversations to build meaningful partnerships with built-in collaboration tools.",
  },
  {
    icon: BarChart3,
    title: "Advanced Analytics",
    body: "Track campaign performance with detailed analytics and real-time insights to optimize your creator partnerships.",
  },
];

const STATS = [
  { value: "50K+", label: "Active Creators" },
  { value: "2K+", label: "Partner Brands" },
  { value: "1M+", label: "Campaigns Completed" },
  { value: "$50M+", label: "Creator Earnings" },
];

function SectionHeading({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="reveal-up mb-20 text-center">
      <p className="mb-4 text-micro font-medium uppercase tracking-micro text-accent">{kicker}</p>
      <h2 className="mb-6 font-display text-h1 font-semibold text-ink">{title}</h2>
      {subtitle ? (
        <p className="mx-auto mt-4 max-w-3xl text-xl leading-[--leading-body] text-ink-muted">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export default function Home() {
  useRevealOnScroll();
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = Math.ceil(TIKTOK_VIDEOS.length / VIDEOS_PER_SLIDE);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % totalSlides);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);

  return (
    <main className="min-h-screen bg-surface">
      <HeroSection
        copy={{
          kicker: "The future of creator partnerships",
          titleLead: "Welcome to",
          titleAccent: "Cricher AI",
          subtitle:
            "Connect with top creators and brands. Build authentic partnerships that drive real results.",
          primaryCta: { label: "Find Creators", href: "/find-creators" },
          secondaryCta: { label: "Join as Creator", href: "/join-creator" },
        }}
      />

      {/* AI Digital Human Service */}
      <DigitalHumanSection lang="en" />

      {/* Why creators choose Cricher AI */}
      <section className="bg-surface-sunken py-[--space-section]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            kicker="For Creators"
            title="Why creators choose Cricher AI"
            subtitle="More campaigns, better pay, and real rewards — all in one platform."
          />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {CREATOR_VALUE_CARDS.map((card) => (
              <article
                key={card.title}
                className="reveal-up group rounded-card border border-line bg-surface-raised p-8 shadow-raised transition-all duration-fast ease-out-expo hover:-translate-y-0.5 hover:shadow-glow"
              >
                <p className="font-display text-h2 font-semibold text-accent">{card.stat}</p>
                <h3 className="mb-4 mt-1 text-h3 font-semibold text-ink">{card.title}</h3>
                <p className="leading-[--leading-body] text-ink-muted">{card.body}</p>
                {card.link ? (
                  <Link
                    href={card.link.href}
                    className="mt-6 inline-flex items-center gap-2 font-medium text-accent transition-colors duration-fast hover:text-accent-strong"
                  >
                    {card.link.label}
                    <ArrowRight className="h-4 w-4 transition-transform duration-fast group-hover:translate-x-1" />
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TikTok showcase carousel */}
      <section className="bg-surface py-[--space-section]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            kicker="Featured Content"
            title="See our creators in action"
            subtitle="Watch real content from our talented creator community and see the quality of work they produce for brands."
          />

          <div className="reveal-up relative">
            <button
              onClick={prevSlide}
              aria-label="Previous videos"
              className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-line bg-surface-raised p-3 shadow-raised transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
              disabled={currentSlide === 0}
            >
              <ChevronLeft className="h-6 w-6 text-ink-muted" />
            </button>
            <button
              onClick={nextSlide}
              aria-label="Next videos"
              className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-line bg-surface-raised p-3 shadow-raised transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
              disabled={currentSlide === totalSlides - 1}
            >
              <ChevronRight className="h-6 w-6 text-ink-muted" />
            </button>

            <div className="mx-12 overflow-hidden">
              <div
                className="flex transition-transform duration-slow ease-out-expo"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              >
                {Array.from({ length: totalSlides }).map((_, slideIndex) => (
                  <div key={slideIndex} className="w-full flex-shrink-0">
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                      {TIKTOK_VIDEOS.slice(
                        slideIndex * VIDEOS_PER_SLIDE,
                        (slideIndex + 1) * VIDEOS_PER_SLIDE
                      ).map((video) => (
                        <figure
                          key={video.id}
                          className="rounded-card border border-line bg-surface-raised p-4 shadow-raised transition-all duration-fast ease-out-expo hover:-translate-y-0.5 hover:shadow-glow"
                        >
                          <div className="relative h-96 w-full overflow-hidden rounded-control bg-surface-sunken">
                            <iframe
                              src={`https://www.tiktok.com/embed/v2/${video.id}`}
                              width="100%"
                              height="100%"
                              frameBorder="0"
                              allow="encrypted-media"
                              allowFullScreen
                              className="rounded-control"
                              title={`TikTok video by ${video.username}`}
                            />
                          </div>
                          <figcaption className="mt-4 text-center">
                            <p className="text-sm font-medium text-ink">{video.username}</p>
                            <p className="mt-1 text-xs text-ink-muted">{video.description}</p>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex justify-center space-x-2">
              {Array.from({ length: totalSlides }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  aria-label={`Go to slide ${index + 1}`}
                  className={`h-3 w-3 rounded-full transition-all duration-fast ${
                    index === currentSlide ? "scale-110 bg-accent" : "bg-line hover:bg-accent/40"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="reveal-up mt-16 text-center">
            <p className="mb-6 text-lg text-ink-muted">
              Ready to create amazing content like this? Join our creator community today.
            </p>
            <Link
              href="/join-creator"
              className="group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-base font-semibold text-accent-contrast shadow-raised transition-colors duration-fast hover:bg-accent-strong"
            >
              Join as Creator
              <ArrowRight className="h-5 w-5 transition-transform duration-fast group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* Platform features */}
      <section className="bg-surface-sunken py-[--space-section]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            kicker="Platform Features"
            title="Everything you need to connect with creators"
            subtitle="Cricher AI provides you with powerful tools to find the perfect creators for your brand campaigns."
          />
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="reveal-up text-center">
                <div className="mx-auto mb-8 inline-flex h-16 w-16 items-center justify-center rounded-card bg-accent-soft">
                  <feature.icon className="h-8 w-8 text-accent" />
                </div>
                <h3 className="mb-4 font-display text-h3 font-semibold text-ink">
                  {feature.title}
                </h3>
                <p className="text-lg leading-[--leading-body] text-ink-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-line bg-surface py-[--space-section]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="reveal-up mb-16 text-center">
            <h2 className="mb-4 font-display text-h1 font-semibold text-ink">
              Trusted by thousands
            </h2>
            <p className="text-xl text-ink-muted">
              Join the growing community of successful partnerships
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="reveal-up text-center">
                <p className="mb-2 font-display text-h1 font-semibold text-accent">{stat.value}</p>
                <p className="text-micro font-medium uppercase tracking-micro text-ink-muted">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — featured gradient moment */}
      <section className="relative overflow-hidden bg-gradient-hero py-[--space-section]">
        <div className="pointer-events-none absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="reveal-up mb-6 font-display text-h1 font-semibold text-white">
            Ready to find your perfect match?
          </h2>
          <p className="reveal-up mx-auto mt-6 max-w-3xl text-xl leading-[--leading-body] text-white/80">
            Join thousands of successful creators and brands who have found their perfect
            partnerships on Cricher AI. Start exploring our creator network today.
          </p>
          <div className="reveal-up mt-12 flex flex-col justify-center gap-6 sm:flex-row">
            <Link
              href="/find-creators"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-lg font-semibold text-accent-strong shadow-overlay transition-transform duration-fast hover:-translate-y-0.5"
            >
              Get Started Now
              <ArrowRight className="h-5 w-5 transition-transform duration-fast group-hover:translate-x-1" />
            </Link>
            <Link
              href="/join-creator"
              className="inline-flex items-center justify-center rounded-full border-2 border-white/40 bg-white/10 px-8 py-4 text-lg font-semibold text-white backdrop-blur-sm transition-colors duration-fast hover:bg-white/20"
            >
              Join as Creator
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
