import { Env } from "../index";

export async function handleThreads(request: Request, env: Env, user: any | null): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  
  try {
    // POST /api/threads - Create new thread
    if (path === "/api/threads" && request.method === "POST") {
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const { board_id, title, content, tags } = await request.json() as any;
      
      if (!board_id || !title || !content) {
        return new Response(JSON.stringify({ error: "缺少必填字段" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Check if board exists
      const board = await env.DB.prepare("SELECT id FROM boards WHERE id = ?").bind(board_id).first();
      if (!board) {
        return new Response(JSON.stringify({ error: "板块不存在" }), { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Create thread
      const result = await env.DB.prepare(`
        INSERT INTO threads (board_id, user_id, title, content, tags)
        VALUES (?, ?, ?, ?, ?)
      `).bind(board_id, user.id, title, content, tags || '').run();
      
      // Update board stats
      await env.DB.prepare(`
        UPDATE boards 
        SET thread_count = thread_count + 1,
            last_thread_id = ?,
            last_post_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(result.meta.last_row_id, board_id).run();
      
      // Add experience to user
      await env.DB.prepare(`
        UPDATE users SET experience = experience + 10 WHERE id = ?
      `).bind(user.id).run();
      
      return new Response(JSON.stringify({ 
        success: true, 
        thread_id: result.meta.last_row_id 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // GET /api/threads/:id - Get thread details
    if (path.match(/^\/api\/threads\/\d+$/) && request.method === "GET") {
      const threadId = path.split("/").pop();
      
      // Increment view count
      await env.DB.prepare(`
        UPDATE threads SET view_count = view_count + 1 WHERE id = ?
      `).bind(threadId).run();
      
      const thread = await env.DB.prepare(`
        SELECT t.id, t.title, t.content, t.view_count, t.like_count, t.post_count,
               t.is_pinned, t.is_featured, t.tags, t.created_at, t.updated_at,
               u.id as user_id, u.nickname as user_nickname, u.avatar_url, u.signature,
               b.id as board_id, b.name as board_name, b.slug as board_slug
        FROM threads t
        JOIN users u ON t.user_id = u.id
        JOIN boards b ON t.board_id = b.id
        WHERE t.id = ?
      `).bind(threadId).first() as any;
      
      if (!thread) {
        return new Response(JSON.stringify({ error: "主题不存在" }), { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Check if user liked this thread
      let isLiked = false;
      let isFavorited = false;
      if (user) {
        const like = await env.DB.prepare(
          "SELECT id FROM likes WHERE user_id = ? AND thread_id = ?"
        ).bind(user.id, threadId).first();
        isLiked = !!like;
        
        const favorite = await env.DB.prepare(
          "SELECT id FROM favorites WHERE user_id = ? AND thread_id = ?"
        ).bind(user.id, threadId).first();
        isFavorited = !!favorite;
      }
      
      return new Response(JSON.stringify({ 
        thread: {
          ...thread,
          is_liked: isLiked,
          is_favorited: isFavorited
        } 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // PUT /api/threads/:id - Update thread
    if (path.match(/^\/api\/threads\/\d+$/) && request.method === "PUT") {
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const threadId = path.split("/").pop();
      const { title, content, tags } = await request.json() as any;
      
      // Check ownership
      const thread = await env.DB.prepare(
        "SELECT user_id FROM threads WHERE id = ?"
      ).bind(threadId).first() as any;
      
      if (!thread) {
        return new Response(JSON.stringify({ error: "主题不存在" }), { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      if (thread.user_id !== user.id && user.role !== "admin") {
        return new Response(JSON.stringify({ error: "无权限修改" }), { 
          status: 403, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      await env.DB.prepare(`
        UPDATE threads 
        SET title = ?, content = ?, tags = ?, updated_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(title, content, tags || '', threadId).run();
      
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // DELETE /api/threads/:id - Delete thread
    if (path.match(/^\/api\/threads\/\d+$/) && request.method === "DELETE") {
      if (!user || user.role !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), { 
          status: 403, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const threadId = path.split("/").pop();
      
      await env.DB.prepare("UPDATE threads SET status = 'deleted' WHERE id = ?")
        .bind(threadId).run();
      
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // POST /api/threads/:id/like - Like thread
    if (path.match(/^\/api\/threads\/\d+\/like$/) && request.method === "POST") {
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const threadId = path.split("/")[3];
      
      // Check if already liked
      const existing = await env.DB.prepare(
        "SELECT id FROM likes WHERE user_id = ? AND thread_id = ?"
      ).bind(user.id, threadId).first();
      
      if (existing) {
        // Unlike
        await env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND thread_id = ?")
          .bind(user.id, threadId).run();
        await env.DB.prepare("UPDATE threads SET like_count = like_count - 1 WHERE id = ?")
          .bind(threadId).run();
      } else {
        // Like
        await env.DB.prepare("INSERT INTO likes (user_id, thread_id) VALUES (?, ?)")
          .bind(user.id, threadId).run();
        await env.DB.prepare("UPDATE threads SET like_count = like_count + 1 WHERE id = ?")
          .bind(threadId).run();
        
        // Create notification for thread author
        const thread = await env.DB.prepare("SELECT user_id FROM threads WHERE id = ?")
          .bind(threadId).first() as any;
        if (thread && thread.user_id !== user.id) {
          await env.DB.prepare(`
            INSERT INTO notifications (user_id, type, title, related_user_id, related_thread_id)
            VALUES (?, 'like', ?, ?, ?)
          `).bind(thread.user_id, `${user.nickname} 点赞了你的主题`, user.id, threadId).run();
        }
      }
      
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // POST /api/threads/:id/favorite - Favorite thread
    if (path.match(/^\/api\/threads\/\d+\/favorite$/) && request.method === "POST") {
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const threadId = path.split("/")[3];
      
      try {
        await env.DB.prepare("INSERT INTO favorites (user_id, thread_id) VALUES (?, ?)")
          .bind(user.id, threadId).run();
      } catch (e) {
        // Already favorited, ignore
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
    console.error("Threads API error:", e);
    return new Response(JSON.stringify({ error: e.message || "Server Error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}
