import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { getEntitlements } from "@/lib/ai-video-entitlements";
import { remainingToday } from "@/lib/ai-video-generation";
import { isMockMode } from "@/lib/seedance";
import { VIDEO_MODELS } from "@/lib/seedance/models";
import ToolTabs from "../ToolTabs";
import GenerateVideoForm from "./GenerateVideoForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Generate AI Video | Cricher AI CreatorHub",
  description: "Describe a scene and generate a short AI video ready to post on TikTok.",
};

export default async function GenerateAiVideoPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { remaining, limit } = await remainingToday(
    session.user.id,
    "generate",
    getEntitlements(session.user.email).generate.dailyLimit
  );

  return (
    <div className="space-y-4 py-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link
          href="/creatorportal/ai-video"
          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 transition hover:text-indigo-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to AI Video Library
        </Link>
        <ToolTabs active="generate" />
      </div>

      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Generate a new AI video</h1>
          <p className="text-sm text-slate-600">
            Describe a scene, add an optional reference image, and pick the model and format.
          </p>
        </header>

        <GenerateVideoForm
          initialRemaining={remaining}
          limit={limit}
          isMock={isMockMode()}
          models={VIDEO_MODELS}
        />
      </div>
    </div>
  );
}
