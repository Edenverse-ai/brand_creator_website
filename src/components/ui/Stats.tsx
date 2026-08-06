interface StatsProps {
  followers: number;
  engagementRate: number;
}

export function Stats({ followers, engagementRate }: StatsProps) {
  return (
    <div className="flex space-x-6">
      <div>
        <p className="font-display text-h2 font-semibold text-ink">{followers.toLocaleString()}</p>
        <p className="text-micro font-medium uppercase tracking-micro text-ink-muted">Followers</p>
      </div>
      <div>
        <p className="font-display text-h2 font-semibold text-ink">{engagementRate.toFixed(2)}%</p>
        <p className="text-micro font-medium uppercase tracking-micro text-ink-muted">
          Engagement Rate
        </p>
      </div>
    </div>
  );
}
