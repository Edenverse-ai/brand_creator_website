import Link from "next/link";
import { Clapperboard, Repeat2 } from "lucide-react";

const TOOLS = [
  {
    id: "generate",
    label: "Video Gen",
    href: "/creatorportal/ai-video/generate",
    icon: Clapperboard,
  },
  {
    id: "replicate",
    label: "Trend Replicate",
    href: "/creatorportal/ai-video/replicate",
    icon: Repeat2,
  },
] as const;

export type AiVideoTool = (typeof TOOLS)[number]["id"];

/** Switches between the AI video tools; each tool is its own route. */
export default function ToolTabs({ active }: { active: AiVideoTool }) {
  return (
    <nav
      aria-label="AI video tools"
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm"
    >
      {TOOLS.map(({ id, label, href, icon: Icon }) => {
        const selected = id === active;
        return (
          <Link
            key={id}
            href={href}
            aria-current={selected ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              selected
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
