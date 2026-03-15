import { Env } from "../index";

export async function handleAdmin(request: Request, env: Env, adminUser: any): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  
  try {
    // GET /api/admin/stats - Get forum statistics
    if (path === "/api/admin/stats" && request.method === "GET") {
      const [users, threads, posts, boards] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) as count FROM users").first() as Promise<any>,
        env.DB.prepare("SELECT COUNT(*) as count FROM threads").first() as Promise<any>,
        env.DB.prepare("SELECT COUNT(*) as count FROM posts").first() as Promise<any>,
        env.DB.prepare("SELECT COUNT(*) as count FROM boards").first() as Promise<any>,
      ]);
      
      return new Response(JSON.stringify({
        stats: {
          users: users.count,
          threads: threads.count,
          posts: posts.count,
          boards: boards.count
        }
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // POST /api/admin/boards - Create board
    if (path === "/api/admin/boards" && request.method === "POST") {
      const { category_id, name, description, slug } = await request.json() as any;
      
      await env.DB.prepare(`
        INSERT INTO boards (category_id, name, description, slug)
        VALUES (?, ?, ?, ?)
      `).bind(category_id, name, description || '', slug).run();
      
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // PUT /api/admin/threads/:id - Manage thread (pin, feature, lock)
    if (path.match(/^\/api\/admin\/threads\/\d+$/) && request.method === "PUT") {
      const threadId = path.split("/").pop();
      const { is_pinned, is_featured, status } = await request.json() as any;
      
      const updates: string[] = [];
      const values: any[] = [];
      
      if (is_pinned !== undefined) {
        updates.push("is_pinned = ?");
        values.push(is_pinned ? 1 : 0);
      }
      if (is_featured !== undefined) {
        updates.push("is_featured = ?");
        values.push(is_featured ? 1 : 0);
      }
      if (status) {
        updates.push("status = ?");
        values.push(status);
      }
      
      values.push(threadId);
      await env.DB.prepare(`UPDATE threads SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...values)
        .run();
      
      // Log admin action
      await env.DB.prepare(`
        INSERT INTO admin_logs (admin_id, action, target_type, target_id)
        VALUES (?, 'update_thread', 'thread', ?)
      `).bind(adminUser.id, threadId).run();
      
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // PUT /api/admin/users/:id - Manage user (ban, change role)
    if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === "PUT") {
      const userId = path.split("/").pop();
      const { status, role, ban_reason } = await request.json() as any;
      
      const updates: string[] = [];
      const values: any[] = [];
      
      if (status) {
        updates.push("status = ?");
        values.push(status);
      }
      if (role) {
        updates.push("role = ?");
        values.push(role);
      }
      if (ban_reason) {
        updates.push("ban_reason = ?");
        values.push(ban_reason);
      }
      
      values.push(userId);
      await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...values)
        .run();
      
      await env.DB.prepare(`
        INSERT INTO admin_logs (admin_id, action, target_type, target_id)
        VALUES (?, 'update_user', 'user', ?)
      `).bind(adminUser.id, userId).run();
      
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // GET /api/admin/logs - Get admin logs
    if (path === "/api/admin/logs" && request.method === "GET") {
      const { results: logs } = await env.DB.prepare(`
        SELECT al.*, u.nickname as admin_name
        FROM admin_logs al
        JOIN users u ON al.admin_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 50
      `).all();
      
      return new Response(JSON.stringify({ logs }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    return new Response(JSON.stringify({ error: "Not Found" }), { 
      status: 404, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
    
  } catch (e: any) {
    console.error("Admin API error:", e);
    return new Response(JSON.stringify({ error: e.message || "Server Error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}
