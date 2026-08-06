import type { Metadata } from "next";
import MembershipContent from "@/components/membership/MembershipContent";

export const metadata: Metadata = {
  title: "Membership | Cricher.ai",
  description:
    "Browse creator cards for free. Become a member to see rates, contact creators, and access the full database.",
};

export default function MembershipPage() {
  return <MembershipContent lang="en" />;
}
