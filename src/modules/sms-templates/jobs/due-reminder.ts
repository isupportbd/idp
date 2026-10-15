import { shouldQueue } from "@/framework/facade.js";
import { runDueReminderScan } from "../services/due-reminder.service.js";

shouldQueue("sms.due_reminder.daily_scan", "sms", async () => {
  const result = await runDueReminderScan();
  console.log(`[sms.due_reminder.daily_scan] firms=${result.firmsScanned} candidates=${result.candidates} dispatched=${result.dispatched}`);
  return result;
});
