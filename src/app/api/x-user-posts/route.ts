import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "1 m"), // 1 requests per minute
});

export async function GET(req: Request) {
  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const BEARER_TOKEN = process.env.BEARER_TOKEN;

  if (!username) {
    return new Response(JSON.stringify({ error: 'Username is required' }), { status: 400 });
  }

  try {
    // 1. Get user ID from username
    const userRes = await fetch(`https://api.x.com/2/users/by/username/${username}`, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }
    const userData = await userRes.json();
    const userId = userData.data?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }

    // 2. Get latest 5 posts
    const postsRes = await fetch(`https://api.x.com/2/users/${userId}/tweets?max_results=5`, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
    });
    if (!postsRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch posts' }), { status: 500 });
    }
    const postsData = await postsRes.json();

    return new Response(JSON.stringify({ posts: postsData.data || [] }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch posts' }), { status: 500 });
  }
}
