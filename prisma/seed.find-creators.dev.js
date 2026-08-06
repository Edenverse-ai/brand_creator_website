/**
 * Local-dev seed for the `FindCreator` table (the Find Creators trading-card grid).
 *
 * `FindCreator` is introspected from the hosted Supabase DB and has no migration,
 * so a freshly migrated local stack has the table empty. Run after `dev:migrate`:
 *
 *   npm run dev:seed:find-creators
 *
 * Covers every rarity tier (SSR >= 1M, SR >= 500K, R below) and leaves
 * `creator_price` set so the members-only rate gate has something to hide.
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CREATORS = [
  {
    handle: "thekfamily33",
    name: "The K Family",
    industry: "Lifestyle",
    content: "Family",
    followers: 2_400_000,
    engagement: 5.8,
    medianViews: 890_000,
    videos: 342,
    price: 2400,
  },
  {
    handle: "mrs.hannahlong",
    name: "Mrs. Hannah Long",
    industry: "Lifestyle",
    content: "Family",
    followers: 1_600_000,
    engagement: 4.8,
    medianViews: 610_000,
    videos: 289,
    price: 2100,
  },
  {
    handle: "allure_fashion",
    name: "Allure Fashion",
    industry: "Fashion",
    content: "Style",
    followers: 1_100_000,
    engagement: 4.2,
    medianViews: 460_000,
    videos: 518,
    price: 1800,
  },
  {
    handle: "thehannahbrie",
    name: "Hannah Brie",
    industry: "Beauty",
    content: "Lifestyle",
    followers: 860_000,
    engagement: 6.1,
    medianViews: 320_000,
    videos: 276,
    price: 1250,
  },
  {
    handle: "bitesbymia",
    name: "Bites by Mia",
    industry: "Food",
    content: "Recipes",
    followers: 720_000,
    engagement: 4.4,
    medianViews: 260_000,
    videos: 233,
    price: 980,
  },
  {
    handle: "jenny_claross",
    name: "Jenny Claross",
    industry: "Comedy",
    content: "Sketch",
    followers: 540_000,
    engagement: 3.9,
    medianViews: 150_000,
    videos: 410,
    price: 860,
  },
  {
    handle: "summerhemphill",
    name: "Summer Hemphill",
    industry: "Lifestyle",
    content: "Vlog",
    followers: 470_000,
    engagement: 7.2,
    medianViews: 210_000,
    videos: 198,
    price: 720,
  },
  {
    handle: "kairuns.la",
    name: "Kai Runs LA",
    industry: "Fitness",
    content: "Sports",
    followers: 380_000,
    engagement: 5.5,
    medianViews: 140_000,
    videos: 156,
    price: 540,
  },
  {
    handle: "leotechtalk",
    name: "Leo Tech Talk",
    industry: "News & Entertainment",
    content: "Tech",
    followers: 290_000,
    engagement: 3.1,
    medianViews: 98_000,
    videos: 187,
    price: 430,
  },
];

function toRow(creator) {
  return {
    id: `seed-${creator.handle}`,
    creator_handle_name: creator.handle,
    display_name: creator.name,
    bio: `${creator.industry} creator on TikTok.`,
    industry_label_name: creator.industry,
    content_label_name: creator.content,
    follower_count: creator.followers,
    following_count: Math.round(creator.followers / 900),
    like_count: Math.round(creator.followers * 12),
    median_views: creator.medianViews,
    videos_count: creator.videos,
    engagement_rate: creator.engagement,
    creator_price: creator.price,
    currency: "$",
    creator_id: `seed-${creator.handle}`,
    profile_image: null,
  };
}

async function main() {
  const rows = CREATORS.map(toRow);

  // Composite primary key is [id, creator_handle_name], so re-running would
  // duplicate nothing but would still conflict — clear the seeded set first.
  await prisma.findCreator.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });

  const { count } = await prisma.findCreator.createMany({ data: rows });
  console.log(`Seeded ${count} FindCreator rows.`);
}

main()
  .catch((error) => {
    console.error("FindCreator seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
