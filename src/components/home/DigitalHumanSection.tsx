import Link from "next/link";
import { ArrowRight, BookOpen, Check, Video } from "lucide-react";

type Lang = "en" | "zh";

const COPY = {
  badge: { en: "New Service", zh: "全新服务" },
  title: { en: "AI Digital Human Studio", zh: "AI 数字人服务" },
  subtitle: {
    en: "We help creators build their own AI digital human — with full production and coaching. Take the course and learn it yourself, or hand it to our team and receive publish-ready digital human videos.",
    zh: "平台为达人提供数字人制作与课程辅导：可以跟随课程自学，也可以把素材交给我们，直接委托制作数字人视频。",
  },
  learn: {
    title: { en: "Learn it yourself", zh: "自学课程" },
    body: {
      en: "A structured video course plus 1-on-1 coaching — learn to create and run your own digital human.",
      zh: "系统视频课程 + 一对一辅导，学会亲手制作并运营自己的数字人。",
    },
    features: [
      { en: "Clone your on-camera look", zh: "数字人形象克隆" },
      { en: "Voice cloning & script templates", zh: "声音克隆与口播脚本" },
      { en: "Community Q&A and course updates", zh: "社群答疑与课程更新" },
    ],
    cta: { en: "Start learning", zh: "开始学习" },
  },
  done: {
    title: { en: "Done for you", zh: "委托制作" },
    body: {
      en: "Send us your footage and script — our team delivers publish-ready digital human videos.",
      zh: "提供素材与脚本，我们的团队交付可直接发布的数字人视频。",
    },
    features: [
      { en: "Custom look and voice", zh: "定制形象与声音" },
      { en: "Delivered per video, ready to post", zh: "按条交付，直接发布" },
      { en: "First draft within 7 days", zh: "最快 7 天交付初稿" },
    ],
    cta: { en: "Request production", zh: "咨询委托制作" },
  },
} as const;

interface DigitalHumanSectionProps {
  lang?: Lang;
}

export default function DigitalHumanSection({ lang = "en" }: DigitalHumanSectionProps) {
  const prefix = lang === "zh" ? "/zh" : "";

  return (
    <section
      id="dh"
      aria-labelledby="dh-heading"
      className="border-b border-gray-100 bg-gradient-to-b from-purple-50 to-white py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-100 px-4 py-1.5 text-[13px] font-bold uppercase tracking-wide text-purple-700">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-600" aria-hidden />
            {COPY.badge[lang]}
          </span>
          <h3 id="dh-heading" className="mt-6 text-4xl font-extrabold text-gray-900 sm:text-5xl">
            {COPY.title[lang]}
          </h3>
          <p className="mx-auto mt-6 max-w-3xl text-xl leading-relaxed text-gray-600">
            {COPY.subtitle[lang]}
          </p>
        </div>

        <div className="mx-auto mt-20 grid max-w-5xl gap-8 md:grid-cols-2">
          {/* Learn it yourself */}
          <div className="group relative rounded-2xl border border-gray-100 bg-white p-8 pt-12 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:border-purple-200 hover:shadow-2xl">
            <div className="absolute -top-6 left-8 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg">
              <BookOpen className="h-6 w-6 text-white" aria-hidden />
            </div>
            <h4 className="text-2xl font-bold text-gray-900">{COPY.learn.title[lang]}</h4>
            <p className="mt-3 leading-relaxed text-gray-600">{COPY.learn.body[lang]}</p>
            <ul className="mt-6 space-y-3">
              {COPY.learn.features.map((feature) => (
                <li key={feature.en} className="flex items-start gap-2.5 text-[15px] text-gray-700">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-purple-600"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  {feature[lang]}
                </li>
              ))}
            </ul>
            <Link
              href={`${prefix}/contact?topic=digital-human-course`}
              className="mt-7 inline-flex items-center gap-1.5 text-[15px] font-semibold text-purple-600 hover:text-purple-800"
            >
              {COPY.learn.cta[lang]}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
          </div>

          {/* Done for you */}
          <div className="group relative rounded-2xl border border-gray-100 bg-white p-8 pt-12 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:border-indigo-200 hover:shadow-2xl">
            <div className="absolute -top-6 left-8 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 shadow-lg">
              <Video className="h-6 w-6 text-white" aria-hidden />
            </div>
            <h4 className="text-2xl font-bold text-gray-900">{COPY.done.title[lang]}</h4>
            <p className="mt-3 leading-relaxed text-gray-600">{COPY.done.body[lang]}</p>
            <ul className="mt-6 space-y-3">
              {COPY.done.features.map((feature) => (
                <li key={feature.en} className="flex items-start gap-2.5 text-[15px] text-gray-700">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  {feature[lang]}
                </li>
              ))}
            </ul>
            <Link
              href={`${prefix}/contact?topic=digital-human-production`}
              className="mt-7 inline-flex items-center justify-center rounded-[10px] bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 text-[15px] font-semibold text-white shadow-md transition hover:brightness-110"
            >
              {COPY.done.cta[lang]}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
