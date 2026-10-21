import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { getEntitlements } from "@/lib/ai-video-entitlements";
import { remainingToday } from "@/lib/ai-video-generation";
import { REPLICATE_SAMPLE } from "@/lib/ai-video-samples";
import { isMockMode } from "@/lib/seedance";
import { VIDEO_MODELS } from "@/lib/seedance/models";
import ToolTabs from "../ToolTabs";
import { fetchReplicateHistory } from "./data";
import ReplicateForm from "./ReplicateForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trend Replicate | Cricher AI CreatorHub",
  description:
    "Turn a trending TikTok into an ad for your product: same shots and pacing, your product.",
};

export default async function ReplicatePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const entitlements = getEntitlements(session.user.email);
  const [{ remaining, limit }, history] = await Promise.all([
    remainingToday(session.user.id, "replicate", entitlements.replicate.dailyLimit),
    fetchReplicateHistory(session.user.id),
  ]);

  return (
    <div className="space-y-8 py-8">
      <Link
        href="/creatorportal/ai-video"
        className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 transition hover:text-indigo-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to AI Video Library
      </Link>

      <div className="space-y-8">
        <ToolTabs active="replicate" />

        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.2em] text-indigo-500">AI production suite</p>
          <h1 className="text-3xl font-semibold text-slate-900">Replicate a trending video</h1>
          <p className="text-base text-slate-600">
            Upload a trending TikTok and photos of your product. We recreate its shots, camera moves
            and pacing as a new ad starring your product. Finished videos land in My Videos, ready
            to post to TikTok.
          </p>
        </header>

        <ReplicateForm
          initialRemaining={remaining}
          limit={limit}
          maxSourceSec={entitlements.replicate.maxSourceSec}
          isMock={isMockMode()}
          models={VIDEO_MODELS}
          initialHistory={history}
          sample={REPLICATE_SAMPLE}
        />
      </div>
    </div>
  );
}
