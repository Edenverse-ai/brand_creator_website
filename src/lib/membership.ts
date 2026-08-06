import "server-only";
import { auth } from "@/lib/auth";

/**
 * Paid membership that unlocks creator rates and contact details.
 *
 * Monthly quota of unlockable creator profiles per tier:
 *   starter 100 · growth 1,000 · pro 3,000
 */
export type MembershipTier = "starter" | "growth" | "pro";

export const MEMBERSHIP_QUOTA: Readonly<Record<MembershipTier, number>> = {
  starter: 100,
  growth: 1000,
  pro: 3000,
};

/**
 * Single source of truth for "is this viewer allowed to see creator rates and
 * contact details".
 *
 * There is no membership storage yet — the `Subscription` model in the schema
 * belongs to the AI video product and must not be reused here, so this fails
 * closed: every viewer is treated as a non-member until membership is persisted
 * (add `membershipTier` to the user/session model and read it below).
 */
export async function getMembershipTier(): Promise<MembershipTier | null> {
  const session = await auth();
  if (!session?.user) return null;

  const tier = (session.user as { membershipTier?: MembershipTier | null }).membershipTier;
  return tier ?? null;
}

export async function isMember(): Promise<boolean> {
  return (await getMembershipTier()) !== null;
}
