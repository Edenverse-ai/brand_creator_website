import type { Metadata } from "next";
import MembershipContent from "@/components/membership/MembershipContent";

export const metadata: Metadata = {
  title: "会员方案 | Cricher.ai",
  description: "达人卡片免费浏览。注册会员即可查看报价、联系达人，并访问完整达人数据库。",
};

export default function MembershipPageChinese() {
  return <MembershipContent lang="zh" />;
}
