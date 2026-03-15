// JWT Utility functions for Cloudflare Workers

export async function createToken(payload: any, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const data = btoa(JSON.stringify({ 
    ...payload, 
    exp: Math.floor(Date.now() / 1000) + 86400 * 7 // 7 days
  }));
  const signature = await hmacSha256(header + "." + data, secret);
  return `${header}.${data}.${signature}`;
}

export async function verifyToken(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const signature = await hmacSha256(parts[0] + "." + parts[1], secret);
    if (signature !== parts[2]) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp < Date.now() / 1000) return null;
    
    return payload;
  } catch (e) {
    return null;
  }
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
