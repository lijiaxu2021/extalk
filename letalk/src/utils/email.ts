// Email service utility

export interface Env {
  RESEND_API_KEY: string;
}

export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  fromName: string = "Letalk Forum"
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <noreply@letalk.com>`,
        to: [to],
        subject,
        html,
      }),
    });
    
    const data = await res.json() as any;
    if (!res.ok) {
      console.error("Resend API error:", data);
      return { success: false, error: data.message || JSON.stringify(data) };
    }
    return { success: true };
  } catch (e: any) {
    console.error("Email fetch failed:", e);
    return { success: false, error: e.message || "Network Error" };
  }
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
