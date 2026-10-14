import { SAMPLE_VIDEOS, type SampleVideo } from "@/lib/ai-video-samples";

export default function SampleVideos({ samples = SAMPLE_VIDEOS }: { samples?: SampleVideo[] }) {
  if (samples.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-5 py-2">
        <h2 className="text-base font-semibold text-slate-900">Sample videos</h2>
      </header>
      <div className="flex flex-wrap gap-4 p-5">
        {samples.map((sample) => (
          // Every sample is 20rem tall and as wide as its frame needs; on a narrow
          // screen the width stops at 100% and the height shrinks with it.
          <div
            key={sample.id}
            data-testid="sample-video"
            className="overflow-hidden rounded-2xl bg-slate-900"
            style={{
              aspectRatio: `${sample.width} / ${sample.height}`,
              width: `min(100%, calc(20rem * ${sample.width} / ${sample.height}))`,
            }}
          >
            {/* No stored poster: preload="metadata" plus the #t fragment paints the first frame. */}
            <video
              src={`${sample.url}#t=0.1`}
              controls
              playsInline
              preload="metadata"
              aria-label={`Sample video: ${sample.title}`}
              className="h-full w-full object-contain"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
