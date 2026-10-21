export type SampleVideo = {
  id: string;
  title: string;
  url: string;
  // Frame proportions only (e.g. 16 and 9), used to reserve the slot before metadata loads.
  width: number;
  height: number;
};

// Public showcase clips in the `studio-samples` bucket, shown in the creator portal
// and on the home pages. They are the same in every environment, so the full URL is
// kept here rather than built from env.
export const SAMPLE_VIDEOS: SampleVideo[] = [
  {
    id: "seedance25-token-race-1",
    title: "Token race",
    url: "https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/object/public/studio-samples/creator-showcase/seedance25-token-race-1.mp4",
    width: 16,
    height: 9,
  },
];

export type ReplicateSample = {
  /** The trending video that was replicated. */
  originalUrl: string;
  /** Product photos, in the order they were uploaded ("Image 1"…). */
  productImageUrls: string[];
  productName: string;
  /** The generated ad. */
  resultUrl: string;
};

// Shown in the Trend Replicate "Example" tab. Null until the showcase assets are
// uploaded to the public `studio-samples` bucket; the tab shows a placeholder.
export const REPLICATE_SAMPLE: ReplicateSample | null = null;
