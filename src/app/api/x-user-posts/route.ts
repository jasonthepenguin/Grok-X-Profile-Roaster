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

// Define a type for the expected Grok API response structure
type GrokChoice = {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
};

type GrokResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: GrokChoice[];
  // Add other fields if needed, like usage
};

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
  const GROK_KEY = process.env.GROK_KEY; // <-- Add Grok API Key

  // X usernames: 1-15 chars, alphanumeric or underscore, no spaces
  const isValidUsername = (name: string) => /^[A-Za-z0-9_]{1,15}$/.test(name);

  if (!username || !isValidUsername(username.trim())) {
    return new Response(JSON.stringify({ error: 'Invalid username. Usernames must be 1-15 characters, letters, numbers, or underscores.' }), { status: 400 });
  }

  if (!GROK_KEY) {
     console.error("GROK_KEY environment variable is not set.");
     return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
  }

  try {
    // 1. Get user ID from username
    const userRes = await fetch(`https://api.x.com/2/users/by/username/${username}`, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
    });
    if (!userRes.ok) {
      const errorData = await userRes.json().catch(() => ({})); // Try to get error details
      const errorMessage = errorData?.title === 'Not Found Error' ? `X user @${username} not found` : 'Failed to fetch user data from X';
      return new Response(JSON.stringify({ error: errorMessage }), { status: userRes.status });
    }
    const userData = await userRes.json();
    const userId = userData.data?.id;
    if (!userId) {
       // This case might be redundant given the !userRes.ok check, but good for safety
      return new Response(JSON.stringify({ error: `X user @${username} not found` }), { status: 404 });
    }

    if (userRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited by X API" }), { status: 429 });
    }

    // 2. Get latest 5 posts 
    const timelineParams = new URLSearchParams({
      max_results: "10",
      "tweet.fields": "text"
    });
    const timelineRes = await fetch(`https://api.x.com/2/users/${userId}/tweets?${timelineParams.toString()}`, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
    });
    if (!timelineRes.ok) {
       const errorText = await timelineRes.text();
      console.error("Error fetching tweets:", timelineRes.status, errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch posts from X' }), { status: timelineRes.status });
    }
    const postsData = await timelineRes.json();
    const tweets = postsData.data || [];

    if (tweets.length === 0) {
        return new Response(JSON.stringify({ analysis: "No recent original posts found to analyze." }), { status: 200 });
    }

    if (timelineRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited by X API" }), { status: 429 });
    }

    // 3. Prepare data for Grok
    const tweetTexts = tweets.map((tweet: { text: string }, index: number) => `${index + 1}. ${tweet.text}`).join('\n');
    const systemPrompt = "You are an AI assistant analyzing a user's recent social media posts to assess their cognitive security (CogSec) profile. Deliver your analysis in a harsh, witty, and brutally honest roasting style. Reference the user's own words and posts directly in your assessment. Focus *only* on the provided text.";
    const userPrompt = `Here are the ${tweets.length} latest original posts from the user @${username}:
${tweetTexts}

Based *only* on these posts, evaluate the user's cognitive security. Be harsh, witty, and reference their own words.

Output the rankings in this exact format (no dashes, no bold, no Markdown, just plain text):

Gullible: [number]
Skeptical: [number]
Oversharing: [number]
Paranoid: [number]

After the rankings, provide a short (1-2 sentence) description explaining your reasoning in the same harsh, roasting style. In your description, refer to the user as "@${username}" and do not mention any other usernames. Output only the rankings and the description, nothing else.`;

    // 4. Call Grok API
    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROK_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: "grok-3-beta",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        }),
    });

    if (!grokRes.ok) {
        const errorText = await grokRes.text();
        console.error("Grok API error:", grokRes.status, errorText);
        return new Response(JSON.stringify({ error: 'Failed to get analysis from AI' }), { status: grokRes.status });
    }

    if (grokRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited by Grok API" }), { status: 429 });
    }

    const grokData: GrokResponse = await grokRes.json();
    console.log("Grok API Response Data:", JSON.stringify(grokData, null, 2));

    // 5. Extract and return Grok's analysis
    const analysis = grokData.choices?.[0]?.message?.content?.trim() || "Could not retrieve analysis.";

    return new Response(JSON.stringify({ analysis: analysis }), { status: 200 });

  } catch (error) {
    console.error("API Route Error:", error);
    // Generic error for unexpected issues
    return new Response(JSON.stringify({ error: 'An internal server error occurred' }), { status: 500 });
  }
}
