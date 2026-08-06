import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

type Lang = "en" | "zh";

interface PlanTheme {
  label: string;
  quotaBox: string;
  quotaValue: string;
  quotaCaption: string;
  check: string;
  cta: string;
}

interface Plan {
  id: string;
  name: Record<Lang, string>;
  price: string;
  quota: string;
  cta: Record<Lang, string>;
  featured: boolean;
  theme: PlanTheme;
}

const PLANS: readonly Plan[] = [
  {
    id: "starter",
    name: { en: "Starter", zh: "初级会员" },
    price: "$99",
    quota: "100",
    cta: { en: "Start with Starter", zh: "注册初级会员" },
    featured: false,
    theme: {
      label: "text-sky-600",
      quotaBox: "bg-sky-50 border-sky-200",
      quotaValue: "text-sky-700",
      quotaCaption: "text-sky-900",
      check: "text-sky-600",
      cta: "bg-slate-100 border border-slate-200 text-slate-900 hover:bg-slate-200",
    },
  },
  {
    id: "growth",
    name: { en: "Growth", zh: "中级会员" },
    price: "$199",
    quota: "1,000",
    cta: { en: "Start with Growth", zh: "注册中级会员" },
    featured: true,
    theme: {
      label: "text-purple-600",
      quotaBox: "bg-purple-50 border-purple-200",
      quotaValue: "text-purple-700",
      quotaCaption: "text-purple-900",
      check: "text-purple-600",
      cta: "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30 hover:brightness-110",
    },
  },
  {
    id: "pro",
    name: { en: "Pro", zh: "高级会员" },
    price: "$299",
    quota: "3,000",
    cta: { en: "Start with Pro", zh: "注册高级会员" },
    featured: false,
    theme: {
      label: "text-amber-700",
      quotaBox: "bg-amber-50 border-amber-200",
      quotaValue: "text-amber-700",
      quotaCaption: "text-amber-900",
      check: "text-amber-600",
      cta: "bg-slate-100 border border-slate-200 text-slate-900 hover:bg-slate-200",
    },
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
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <section className="relative overflow-hidden bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 text-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.1) 0%, transparent 50%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <span className="mb-6 inline-block rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-purple-100">
            {COPY.eyebrow[lang]}
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            {COPY.heroTitle[lang]}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300 sm:text-xl">
            {COPY.heroSubtitle[lang]}
          </p>
        </div>
      </section>

      <section id="plans" className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6 lg:px-8 lg:pt-20">
        <div className="grid items-stretch gap-8 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const card = (
              <div
                className={`flex h-full flex-col rounded-2xl bg-white p-8 ${
                  plan.featured ? "" : "border border-gray-200 shadow-sm"
                }`}
              >
                <div className={`text-sm font-bold uppercase tracking-widest ${plan.theme.label}`}>
                  {plan.name[lang]}
                </div>

                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-5xl font-extrabold text-gray-900">{plan.price}</span>
                  <span className="text-base text-gray-500">{COPY.perMonth[lang]}</span>
                </div>

                <div className={`mt-5 rounded-xl border px-4 py-3.5 ${plan.theme.quotaBox}`}>
                  <div className={`text-2xl font-extrabold ${plan.theme.quotaValue}`}>
                    {plan.quota}
                  </div>
                  <div className={`text-sm ${plan.theme.quotaCaption}`}>
                    {COPY.quotaCaption[lang]}
                  </div>
                </div>

                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {PLAN_FEATURES.map((feature) => (
                    <li
                      key={feature.en}
                      className="flex items-start gap-2.5 text-[15px] text-gray-700"
                    >
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${plan.theme.check}`}
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <span>{feature[lang]}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`${prefix}/join-brand?plan=${plan.id}`}
                  className={`mt-7 inline-flex items-center justify-center rounded-xl px-6 py-3 text-[15px] font-semibold transition ${plan.theme.cta}`}
                >
                  {plan.cta[lang]}
                </Link>
              </div>
            );

            if (!plan.featured) {
              return (
                <div
                  key={plan.id}
                  className="transition duration-300 hover:-translate-y-1.5 hover:shadow-xl"
                >
                  {card}
                </div>
              );
            }

            return (
              <div
                key={plan.id}
                className="relative rounded-[18px] bg-gradient-to-br from-purple-500 to-indigo-600 p-0.5 shadow-2xl shadow-purple-500/30 transition duration-300 hover:-translate-y-1.5"
              >
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-1.5 text-xs font-bold tracking-wide text-white shadow-lg shadow-purple-500/40">
                  {COPY.popular[lang]}
                </span>
                {card}
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-sm leading-relaxed text-gray-500">
          {COPY.billingNote[lang]}
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-8 rounded-2xl bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-12">
          <div>
            <h2 className="mb-2 text-2xl font-extrabold text-white sm:text-3xl">
              {COPY.ctaTitle[lang]}
            </h2>
            <p className="text-base text-purple-100">{COPY.ctaSubtitle[lang]}</p>
          </div>
          <Link
            href={`${prefix}/find-creators`}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-purple-900 shadow-lg transition hover:bg-gray-50"
          >
            {COPY.ctaButton[lang]}
            <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
