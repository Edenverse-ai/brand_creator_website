"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Search, Users } from "lucide-react";
import DigitalHumanSection from "@/components/home/DigitalHumanSection";
import HeroSection from "@/components/home/HeroSection";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";

const FEATURES = [
  {
    icon: Search,
    title: "寻找创作者",
    body: "发现与您的品牌价值观和目标受众相符的各平台创作者。",
  },
  {
    icon: Users,
    title: "连接合作",
    body: "轻松与创作者建立联系，开始对话，建立有意义的合作关系。",
  },
  {
    icon: BarChart3,
    title: "分析结果",
    body: "通过详细分析跟踪活动效果，优化您的创作者合作关系。",
  },
];

export default function HomeChinese() {
  useRevealOnScroll();
  return (
    <main className="min-h-screen bg-surface">
      <HeroSection
        copy={{
          kicker: "创作者合作新时代",
          titleLead: "欢迎来到",
          titleAccent: "Boderx",
          subtitle: "在这里，您将找到最佳合作伙伴！",
          primaryCta: { label: "寻找创作者", href: "/zh/find-creators" },
          secondaryCta: { label: "了解更多", href: "/zh/about" },
        }}
      />

      {/* AI 数字人服务 */}
      <DigitalHumanSection lang="zh" />

      {/* Features */}
      <section className="bg-surface-sunken py-[--space-section]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="reveal-up mb-16 text-center">
            <p className="mb-4 text-micro font-medium uppercase tracking-micro text-accent">
              特色功能
            </p>
            <h2 className="mb-6 font-display text-h1 font-semibold text-ink">
              连接创作者所需的一切
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-xl leading-[--leading-body] text-ink-muted">
              Boderx 为您提供强大的工具，帮助您为品牌活动找到完美的创作者。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="reveal-up rounded-card border border-line bg-surface-raised p-8 text-center shadow-raised transition-all duration-fast ease-out-expo hover:-translate-y-0.5 hover:shadow-glow"
              >
                <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-card bg-accent-soft">
                  <feature.icon className="h-7 w-7 text-accent" />
                </div>
                <h3 className="mb-4 font-display text-h3 font-semibold text-ink">
                  {feature.title}
                </h3>
                <p className="leading-[--leading-body] text-ink-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — featured gradient moment */}
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:flex lg:items-center lg:justify-between lg:px-8 lg:py-16">
          <h2 className="reveal-up font-display text-h2 font-semibold tracking-tight text-white">
            <span className="block">准备好寻找完美匹配了吗？</span>
            <span className="block text-white/70">立即开始探索我们的创作者网络。</span>
          </h2>
          <div className="reveal-up mt-8 flex lg:mt-0 lg:flex-shrink-0">
            <Link
              href="/zh/find-creators"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-accent-strong shadow-overlay transition-transform duration-fast hover:-translate-y-0.5"
            >
              开始使用
              <ArrowRight className="h-4 w-4 transition-transform duration-fast group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
