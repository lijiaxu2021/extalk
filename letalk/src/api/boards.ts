import { Env } from "../index";

export async function handleBoards(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  
  try {
    // GET /api/boards - Get all boards with categories
    if (path === "/api/boards" && request.method === "GET") {
      const { results: categories } = await env.DB.prepare(`
        SELECT c.id, c.name, c.description, c.icon, c.display_order,
               (SELECT json_group_array(json_object(
                 'id', b.id,
                 'name', b.name,
                 'description', b.description,
                 'icon', b.icon,
                 'slug', b.slug,
                 'thread_count', b.thread_count,
                 'post_count', b.post_count,
                 'last_post_at', b.last_post_at
               ))
                FROM boards b 
                WHERE b.category_id = c.id AND b.status = 'active'
                ORDER BY b.display_order) as boards
        FROM categories c
        WHERE 1=1
        ORDER BY c.display_order
      `).all();
      
      // Parse the JSON boards
      const categoriesWithBoards = categories.map((cat: any) => ({
        ...cat,
        boards: JSON.parse(cat.boards || '[]')
      }));
      
      return new Response(JSON.stringify({ categories: categoriesWithBoards }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // GET /api/boards/:slug - Get board by slug
    if (path.match(/^\/api\/boards\/[^\/]+$/) && request.method === "GET") {
      const slug = path.split("/").pop();
      
      const board = await env.DB.prepare(`
        SELECT b.id, b.name, b.description, b.icon, b.slug, b.thread_count, b.post_count,
               b.last_post_at, c.id as category_id, c.name as category_name
        FROM boards b
        JOIN categories c ON b.category_id = c.id
        WHERE b.slug = ? AND b.status = 'active'
      `).bind(slug).first() as any;
      
      if (!board) {
        return new Response(JSON.stringify({ error: "Board not found" }), { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      return new Response(JSON.stringify({ board }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // GET /api/boards/:slug/threads - Get threads in a board
    if (path.match(/^\/api\/boards\/[^\/]+\/threads$/) && request.method === "GET") {
      const slug = path.split("/")[3]; // /api/boards/:slug/threads
      
      const board = await env.DB.prepare("SELECT id FROM boards WHERE slug = ?").bind(slug).first() as any;
      if (!board) {
        return new Response(JSON.stringify({ error: "Board not found" }), { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      const sort = url.searchParams.get("sort") || "latest"; // latest, pinned, featured
      
      let orderClause = "ORDER BY t.is_pinned DESC, t.created_at DESC";
      if (sort === "featured") {
        orderClause = "ORDER BY t.is_featured DESC, t.created_at DESC";
      }
      
      const { results: threads } = await env.DB.prepare(`
        SELECT t.id, t.title, t.content, t.view_count, t.like_count, t.post_count,
               t.is_pinned, t.is_featured, t.tags, t.created_at, t.updated_at,
               u.id as user_id, u.nickname as user_nickname, u.avatar_url,
               (SELECT COUNT(*) FROM favorites WHERE thread_id = t.id) as favorite_count
        FROM threads t
        JOIN users u ON t.user_id = u.id
        WHERE t.board_id = ? AND t.status = 'active'
        ${orderClause}
        LIMIT ? OFFSET ?
      `).bind(board.id, limit, offset).all();
      
      const { count } = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM threads WHERE board_id = ? AND status = 'active'
      `).bind(board.id).first() as any;
      
      return new Response(JSON.stringify({ threads, total: count, page, limit }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    return new Response(JSON.stringify({ error: "Not Found" }), { 
      status: 404, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
    
  } catch (e: any) {
    console.error("Boards API error:", e);
    return new Response(JSON.stringify({ error: e.message || "Server Error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}
