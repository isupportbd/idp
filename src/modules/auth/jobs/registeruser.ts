import { DateTime as Datetime } from "luxon";
import { dispatchEvent, mail, shouldQueue } from "@/framework/facade.js";

shouldQueue("user:signup", "mail", async (job) => {
  const { email, name, userId } = job.data;

  // Never email or persist secrets (the previous template embedded the user's
  // plaintext password, which was also stored in the queued job payload).
  await mail.sendMail({
    to: email,
    subject: "Account Creation",
    html: `
      <p>Hello ${name},</p>
      <p>Your account was created successfully.</p>
      <p>Email: ${email}</p>
      <p>For your security we do not send passwords by email. If you have forgotten your password, use the "Forgot password" link on the sign-in page to reset it.</p>
    `
  });

  await dispatchEvent("admin.user.registered", { userId, name, email, createdAt: Datetime.now() }, { broadcast: { roles: ["admin"] } });

  await dispatchEvent("user.registered", { message: "Welcome! Your account has been created." }, { broadcast: { users: [userId] } });

  return { ok: true, userId };
});
