import { Env } from "../index";
import { hashPassword, createToken, verifyToken } from "../utils/jwt";
import { sendEmail, generateOTP } from "../utils/email";

// Verify hCaptcha
async function verifyHcaptcha(secret: string, token: string): Promise<boolean> {
  try {
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);
    
    const res = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      body: params,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    
    const data = await res.json() as any;
    return data.success === true;
  } catch (e) {
    return false;
  }
}

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // POST /api/auth/register - User Registration
    if (path === "/api/auth/register" && request.method === "POST") {
      const { email, nickname, password, hcaptcha_token } = await request.json() as any;
      
      if (!email || !nickname || !password) {
        return new Response(JSON.stringify({ error: "请填写完整信息" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Verify hCaptcha
      if (hcaptcha_token) {
        const valid = await verifyHcaptcha(env.HCAPTCHA_SECRET_KEY, hcaptcha_token);
        if (!valid) {
          return new Response(JSON.stringify({ error: "人机验证失败" }), { 
            status: 403, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "缺少人机验证" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Check if email exists
      const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
        .bind(email)
        .first();
      
      if (existingUser) {
        return new Response(JSON.stringify({ error: "该邮箱已被注册" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const passHash = await hashPassword(password);
      const otp = generateOTP();
      
      // Send verification email
      const emailResult = await sendEmail(
        env,
        email,
        "验证您的 Letalk 论坛账户",
        `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #0070f3;">邮箱验证</h2>
          <p>您好！您正在注册 <b>Letalk 论坛</b> 账户。</p>
          <p>您的验证码为：</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0070f3; margin: 20px 0; padding: 15px; border: 2px dashed #0070f3; text-align: center;">${otp}</div>
          <p>请在 10 分钟内完成验证。如果不是您本人操作，请忽略此邮件。</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">此邮件由 Letalk 论坛自动发出。</p>
        </div>
        `,
        "Letalk Forum"
      );
      
      if (!emailResult.success) {
        return new Response(JSON.stringify({ error: "邮件发送失败：" + emailResult.error }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Store user with OTP
      await env.DB.prepare(`
        INSERT INTO users (email, nickname, password_hash, verification_token, verified) 
        VALUES (?, ?, ?, ?, 0)
      `).bind(email, nickname, passHash, otp).run();
      
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // POST /api/auth/verify - Verify Email OTP
    if (path === "/api/auth/verify" && request.method === "POST") {
      const { email, token } = await request.json() as any;
      
      if (!email || !token) {
        return new Response(JSON.stringify({ error: "缺少参数" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const result = await env.DB.prepare(`
        UPDATE users 
        SET verified = 1, verification_token = NULL 
        WHERE email = ? AND verification_token = ?
      `).bind(email, token).run();
      
      if (result.meta.changes > 0) {
        return new Response(JSON.stringify({ success: true }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      } else {
        return new Response(JSON.stringify({ error: "验证码错误或已过期" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }
    
    // POST /api/auth/login - User Login
    if (path === "/api/auth/login" && request.method === "POST") {
      const { email, password, hcaptcha_token } = await request.json() as any;
      
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "请填写邮箱和密码" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Verify hCaptcha
      if (hcaptcha_token) {
        const valid = await verifyHcaptcha(env.HCAPTCHA_SECRET_KEY, hcaptcha_token);
        if (!valid) {
          return new Response(JSON.stringify({ error: "人机验证失败" }), { 
            status: 403, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "缺少人机验证" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      const passHash = await hashPassword(password);
      
      const user = await env.DB.prepare(`
        SELECT id, email, nickname, role, avatar_url, verified 
        FROM users 
        WHERE email = ? AND password_hash = ?
      `).bind(email, passHash).first() as any;
      
      if (!user) {
        return new Response(JSON.stringify({ error: "邮箱或密码错误" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      if (!user.verified) {
        return new Response(JSON.stringify({ error: "邮箱未验证" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Create JWT token
      const token = await createToken(
        { id: user.id, email: user.email, role: user.role }, 
        env.JWT_SECRET
      );
      
      return new Response(JSON.stringify({ 
        token, 
        user: {
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          role: user.role,
          avatar_url: user.avatar_url
        }
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // POST /api/auth/logout - User Logout (client-side mostly)
    if (path === "/api/auth/logout" && request.method === "POST") {
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    return new Response(JSON.stringify({ error: "Not Found" }), { 
      status: 404, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
    
  } catch (e: any) {
    console.error("Auth error:", e);
    return new Response(JSON.stringify({ error: e.message || "Server Error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}
