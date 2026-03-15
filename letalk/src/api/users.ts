import { Env } from "../index";

export async function handleUsers(request: Request, env: Env, currentUser: any): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  
  try {
    // GET /api/users/me - Get current user profile
    if (path === "/api/users/me" && request.method === "GET") {
      const user = await env.DB.prepare(`
        SELECT u.id, u.email, u.nickname, u.avatar_url, u.signature, u.role, u.level, u.experience,
               u.created_at, p.bio, p.website, p.company, p.location
        FROM users u
        LEFT JOIN user_profiles p ON u.id = p.user_id
        WHERE u.id = ?
      `).bind(currentUser.id).first() as any;
      
      if (!user) {
        return new Response(JSON.stringify({ error: "User not found" }), { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      return new Response(JSON.stringify({ user }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // PUT /api/users/profile - Update user profile
    if (path === "/api/users/profile" && request.method === "PUT") {
      const { nickname, signature, bio, website, company, location } = await request.json() as any;
      
      // Update users table
      if (nickname || signature) {
        const updates: string[] = [];
        const values: any[] = [];
        
        if (nickname) {
          updates.push("nickname = ?");
          values.push(nickname);
        }
        if (signature !== undefined) {
          updates.push("signature = ?");
          values.push(signature);
        }
        
        values.push(currentUser.id);
        await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
          .bind(...values)
          .run();
      }
      
      // Update user_profiles table
      if (bio || website || company || location) {
        await env.DB.prepare(`
          INSERT INTO user_profiles (user_id, bio, website, company, location)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            bio = excluded.bio,
            website = excluded.website,
            company = excluded.company,
            location = excluded.location
        `).bind(currentUser.id, bio || '', website || '', company || '', location || '').run();
      }
      
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // GET /api/users/threads - Get user's threads
    if (path === "/api/users/threads" && request.method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "10");
      const offset = (page - 1) * limit;
      
      const { results: threads } = await env.DB.prepare(`
        SELECT t.id, t.title, t.board_id, b.name as board_name, t.view_count, t.like_count, t.post_count,
               t.created_at, t.updated_at
        FROM threads t
        JOIN boards b ON t.board_id = b.id
        WHERE t.user_id = ? AND t.status = 'active'
        ORDER BY t.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(currentUser.id, limit, offset).all();
      
      const { count } = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM threads WHERE user_id = ? AND status = 'active'
      `).bind(currentUser.id).first() as any;
      
      return new Response(JSON.stringify({ threads, total: count, page, limit }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // GET /api/users/posts - Get user's posts
    if (path === "/api/users/posts" && request.method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      
      const { results: posts } = await env.DB.prepare(`
        SELECT p.id, p.content, p.thread_id, t.title as thread_title, p.created_at
        FROM posts p
        JOIN threads t ON p.thread_id = t.id
        WHERE p.user_id = ? AND p.status = 'active'
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(currentUser.id, limit, offset).all();
      
      const { count } = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND status = 'active'
      `).bind(currentUser.id).first() as any;
      
      return new Response(JSON.stringify({ posts, total: count, page, limit }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    return new Response(JSON.stringify({ error: "Not Found" }), { 
      status: 404, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
    
  } catch (e: any) {
    console.error("Users API error:", e);
    return new Response(JSON.stringify({ error: e.message || "Server Error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}
