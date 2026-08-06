import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

type Lang = "en" | "zh";

interface Plan {
  id: string;
  name: Record<Lang, string>;
  price: string;
  quota: string;
  cta: Record<Lang, string>;
  featured: boolean;
}

const PLANS: readonly Plan[] = [
  {
    id: "starter",
    name: { en: "Starter", zh: "初级会员" },
    price: "$99",
    quota: "100",
    cta: { en: "Start with Starter", zh: "注册初级会员" },
    featured: false,
  },
  {
    id: "growth",
    name: { en: "Growth", zh: "中级会员" },
    price: "$199",
    quota: "1,000",
    cta: { en: "Start with Growth", zh: "注册中级会员" },
    featured: true,
  },
  {
    id: "pro",
    name: { en: "Pro", zh: "高级会员" },
    price: "$299",
    quota: "3,000",
    cta: { en: "Start with Pro", zh: "注册高级会员" },
    featured: false,
  },
];

const PLAN_FEATURES: readonly Record<Lang, string>[] = [
  { en: "Unlocked creator rates", zh: "解锁达人合作报价" },
  { en: "Creator contact details", zh: "达人联系方式" },
  { en: "Full metrics on creator cards", zh: "达人卡片完整指标" },
];

const COPY = {
  eyebrow: { en: "Membership", zh: "会员方案" },
  heroTitle: {
    en: "Unlock creator rates and contacts",
    zh: "解锁达人报价与联系方式",
  },
  heroSubtitle: {
    en: "Browse creator cards for free. Become a member to see rates, contact creators, and access the full database.",
    zh: "达人卡片免费浏览。注册会员即可查看报价、联系达人，并访问完整达人数据库。",
  },
  quotaCaption: { en: "creator profiles per month", zh: "每月可查看达人信息" },
  popular: { en: "MOST POPULAR", zh: "最受欢迎" },
  perMonth: { en: "/ month", zh: "/ 月" },
  billingNote: {
    en: "All plans are billed monthly and can be cancelled anytime. Profile views reset each billing cycle.",
    zh: "所有方案按月计费，可随时取消。达人查看额度每个计费周期重置。",
  },
  ctaTitle: { en: "Not sure which plan fits?", zh: "不确定哪个方案适合您？" },
  ctaSubtitle: {
    en: "Browse the creator cards first — upgrade whenever you're ready to reach out.",
    zh: "先免费浏览达人卡片，需要联系达人时再升级即可。",
  },
  ctaButton: { en: "Browse creators", zh: "浏览达人" },
} as const;

interface MembershipContentProps {
  lang: Lang;
}

export default function MembershipContent({ lang }: MembershipContentProps) {
  const prefix = lang === "zh" ? "/zh" : "";

  return (
    <main className="min-h-screen bg-surface text-ink">
      <section className="border-b border-line bg-surface-sunken">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <p className="mb-6 text-micro font-medium uppercase tracking-micro text-accent">
            {COPY.eyebrow[lang]}
          </p>
          <h1 className="font-display text-h1 font-semibold text-ink">{COPY.heroTitle[lang]}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-[--leading-body] text-ink-muted sm:text-xl">
            {COPY.heroSubtitle[lang]}
          </p>
        </div>
      </section>

      <section id="plans" className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6 lg:px-8 lg:pt-20">
        <div className="grid items-stretch gap-8 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const card = (
              <div
                className={`flex h-full flex-col rounded-card bg-surface-raised p-8 ${
                  plan.featured ? "" : "border border-line shadow-raised"
                }`}
              >
                <div
                  className={`text-micro font-bold uppercase tracking-micro ${
                    plan.featured ? "text-accent" : "text-ink-muted"
                  }`}
                >
                  {plan.name[lang]}
                </div>

                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-display text-5xl font-semibold text-ink">{plan.price}</span>
                  <span className="text-base text-ink-muted">{COPY.perMonth[lang]}</span>
                </div>

                <div className="mt-5 rounded-control border border-accent-soft bg-accent-soft px-4 py-3.5">
                  <div className="font-display text-h3 font-semibold text-accent">{plan.quota}</div>
                  <div className="text-sm text-ink-muted">{COPY.quotaCaption[lang]}</div>
                </div>

                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {PLAN_FEATURES.map((feature) => (
                    <li key={feature.en} className="flex items-start gap-2.5 text-[15px] text-ink">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <span>{feature[lang]}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`${prefix}/join-brand?plan=${plan.id}`}
                  className={`mt-7 inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-semibold transition-colors duration-fast ${
                    plan.featured
                      ? "bg-accent text-accent-contrast shadow-raised hover:bg-accent-strong"
                      : "border border-line bg-surface-sunken text-ink hover:bg-surface-sunken/70"
                  }`}
                >
                  {plan.cta[lang]}
                </Link>
              </div>
            );

            if (!plan.featured) {
              return (
                <div
                  key={plan.id}
                  className="transition-all duration-fast ease-out-expo hover:-translate-y-0.5 hover:shadow-glow rounded-card"
                >
                  {card}
                </div>
              );
            }

            return (
              <div
                key={plan.id}
                className="relative rounded-[18px] bg-gradient-hero p-0.5 shadow-glow transition-transform duration-fast ease-out-expo hover:-translate-y-0.5"
              >
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-hero px-4 py-1.5 text-xs font-bold tracking-wide text-white shadow-raised">
                  {COPY.popular[lang]}
                </span>
                {card}
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-sm leading-[--leading-body] text-ink-muted">
          {COPY.billingNote[lang]}
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-8 rounded-card bg-gradient-hero p-12 shadow-overlay">
          <div>
            <h2 className="mb-2 font-display text-h2 font-semibold text-white">
              {COPY.ctaTitle[lang]}
            </h2>
            <p className="text-base text-white/80">{COPY.ctaSubtitle[lang]}</p>
          </div>
          <Link
            href={`${prefix}/find-creators`}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-white px-7 py-3.5 text-base font-semibold text-accent-strong shadow-overlay transition-transform duration-fast hover:-translate-y-0.5"
          >
            {COPY.ctaButton[lang]}
            <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
