import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { remainingToday } from "@/lib/ai-video-generation";
import { isMockMode } from "@/lib/seedance";
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

  const { remaining, limit } = await remainingToday(session.user.id);

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
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.2em] text-indigo-500">AI production suite</p>
          <h1 className="text-3xl font-semibold text-slate-900">Generate a new AI video</h1>
          <p className="text-base text-slate-600">
            Describe the scene, optionally add a reference image, and pick the format. Finished
            videos land in My Videos, ready to post to TikTok.
          </p>
        </header>

        <GenerateVideoForm initialRemaining={remaining} limit={limit} isMock={isMockMode()} />
      </div>
    </div>
  );
}
