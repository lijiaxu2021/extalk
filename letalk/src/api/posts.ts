import { Env } from "../index";

export async function handlePosts(request: Request, env: Env, user: any | null): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  
  try {
    // POST /api/posts - Create new post (reply)
    if (path === "/api/posts" && request.method === "POST") {
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const { thread_id, content, parent_id } = await request.json() as any;
      
      if (!thread_id || !content) {
        return new Response(JSON.stringify({ error: "缺少必填字段" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Check if thread exists
      const thread = await env.DB.prepare("SELECT id, user_id FROM threads WHERE id = ? AND status = 'active'")
        .bind(thread_id).first();
      if (!thread) {
        return new Response(JSON.stringify({ error: "主题不存在或已删除" }), { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Get IP and location (simplified)
      const ip = "127.0.0.1";
      const location = "未知";
      
      // Create post
      const result = await env.DB.prepare(`
        INSERT INTO posts (thread_id, user_id, parent_id, content, ip, location)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(thread_id, user.id, parent_id || null, content, ip, location).run();
      
      // Get floor number
      const { count } = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM posts WHERE thread_id = ? AND id <= ?"
      ).bind(thread_id, result.meta.last_row_id).first() as any;
      
      await env.DB.prepare("UPDATE posts SET floor_number = ? WHERE id = ?")
        .bind(count, result.meta.last_row_id).run();
      
      // Update thread stats
      await env.DB.prepare(`
        UPDATE threads 
        SET post_count = post_count + 1,
            last_post_id = ?,
            last_post_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(result.meta.last_row_id, thread_id).run();
      
      // Update board stats
      const threadData = await env.DB.prepare("SELECT board_id FROM threads WHERE id = ?")
        .bind(thread_id).first() as any;
      await env.DB.prepare(`
        UPDATE boards 
        SET post_count = post_count + 1,
            last_post_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(threadData.board_id).run();
      
      // Add experience
      await env.DB.prepare("UPDATE users SET experience = experience + 5 WHERE id = ?")
        .bind(user.id).run();
      
      // Create notification for thread author
      if ((thread as any).user_id !== user.id) {
        const action = parent_id ? "回复了你的评论" : "回复了你的主题";
        await env.DB.prepare(`
          INSERT INTO notifications (user_id, type, title, related_user_id, related_thread_id, related_post_id)
          VALUES (?, 'reply', ?, ?, ?, ?)
        `).bind((thread as any).user_id, `${user.nickname} ${action}`, user.id, thread_id, result.meta.last_row_id).run();
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        post_id: result.meta.last_row_id,
        floor_number: count
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // GET /api/posts/:thread - Get posts in a thread
    if (path.match(/^\/api\/posts\/\d+$/) && request.method === "GET") {
      const threadId = path.split("/").pop();
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      
      const { results: posts } = await env.DB.prepare(`
        SELECT p.id, p.content, p.floor_number, p.like_count, p.created_at,
               u.id as user_id, u.nickname, u.avatar_url, u.signature
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.thread_id = ? AND p.status = 'active'
        ORDER BY p.created_at ASC
        LIMIT ? OFFSET ?
      `).bind(threadId, limit, offset).all();
      
      const { count } = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM posts WHERE thread_id = ? AND status = 'active'"
      ).bind(threadId).first() as any;
      
      return new Response(JSON.stringify({ posts, total: count, page, limit }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // POST /api/posts/:id/like - Like post
    if (path.match(/^\/api\/posts\/\d+\/like$/) && request.method === "POST") {
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const postId = path.split("/")[3];
      
      const existing = await env.DB.prepare(
        "SELECT id FROM likes WHERE user_id = ? AND post_id = ?"
      ).bind(user.id, postId).first();
      
      if (existing) {
        await env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?")
          .bind(user.id, postId).run();
        await env.DB.prepare("UPDATE posts SET like_count = like_count - 1 WHERE id = ?")
          .bind(postId).run();
      } else {
        await env.DB.prepare("INSERT INTO likes (user_id, post_id) VALUES (?, ?)")
          .bind(user.id, postId).run();
        await env.DB.prepare("UPDATE posts SET like_count = like_count + 1 WHERE id = ?")
          .bind(postId).run();
      }
      
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    return new Response(JSON.stringify({ error: "Not Found" }), { 
      status: 404, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
    
  } catch (e: any) {
    console.error("Posts API error:", e);
    return new Response(JSON.stringify({ error: e.message || "Server Error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}
