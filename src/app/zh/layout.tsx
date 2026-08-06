/*
 * zh subtree: .zh-typography (variables.css) re-points --font-display /
 * --font-body at system CJK stacks and adjusts leading/tracking.
 * No build-time font download — Google-hosted Noto SC fetch made builds
 * unacceptably slow. If a webfont is wanted later, self-host a subset
 * via next/font/local.
 */
export default function ZhLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="zh-CN" className="zh-typography">
      {children}
    </div>
  );
}
