import { useQuery } from '@tanstack/react-query';
import { fetchFeedStatus } from '../../lib/mockFeeds';

export function FeedStatus() {
  const { data = [] } = useQuery({ queryKey: ['feed-status'], queryFn: fetchFeedStatus, refetchInterval: 3500 });
  return <div className="feed-status">
    {data.map((feed) => <div key={feed.feed}>
      <span className={feed.status}></span>
      <b>{feed.feed}</b>
      <p>{feed.status} · {feed.latency}</p>
    </div>)}
  </div>;
}
