import { defineSchedule } from "@/framework/facade.js";

defineSchedule({
  name: "sms.due_reminder.daily_scan",
  expression: "0 10 * * *",
  queue: "sms",
  job: "sms.due_reminder.daily_scan",
  data: {},
  timezone: "Asia/Dhaka"
});
