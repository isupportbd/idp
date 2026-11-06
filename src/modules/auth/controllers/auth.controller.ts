/**
 * Auth Controller Facade / Barrel File
 *
 * Modular domain-driven controllers:
 * - auth-registration.controller.ts (register)
 * - auth-session.controller.ts (login, me, logout, logoutAllDevices)
 * - auth-password.controller.ts (forgotPassword, resetPassword)
 * - auth-verification.controller.ts (verifyEmail)
 * - auth-token.controller.ts (refreshToken)
 * - auth-wallet.controller.ts (rechargeWallet, buyStorage)
 * - auth-profile-stats.controller.ts (getUserStats, sendTestSms, syncSmsBalance)
 */

export * from "./auth-password.controller.js";
export * from "./auth-profile-stats.controller.js";
export * from "./auth-registration.controller.js";
export * from "./auth-session.controller.js";
export * from "./auth-token.controller.js";
export * from "./auth-verification.controller.js";
export * from "./auth-wallet.controller.js";
