import crypto from "node:crypto";
import { httpError } from "./http-error.js";
import { prisma } from "./prisma.js";

const DEVICE_HEADER = "x-hrms-device-id";

function cleanText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 180);
}

export function getRequestIp(request) {
  const forwarded = request.get("cf-connecting-ip") || request.get("x-forwarded-for") || "";
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.ip || request.socket?.remoteAddress || "";
}

export function getDeviceKey(request) {
  return String(request.get(DEVICE_HEADER) || request.body?.deviceKey || "").trim();
}

export function deviceFingerprint(deviceKey) {
  return crypto.createHash("sha256").update(deviceKey).digest("hex");
}

export function deviceMetadata(request) {
  const userAgent = request.get("user-agent") || "";
  const clientDevice = request.body?.deviceInfo || {};
  const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(userAgent);
  const deviceType = cleanText(clientDevice.deviceType || (isMobileUserAgent ? "Mobile" : "Desktop"), "Desktop");
  const browser = cleanText(clientDevice.browser || browserFromUserAgent(userAgent), "Unknown browser");
  const platform = cleanText(clientDevice.platform || platformFromUserAgent(userAgent), "Unknown platform");
  const deviceName = cleanText(clientDevice.deviceName || `${platform} - ${browser}`, "Unknown device");
  const location = locationFromRequest(request, clientDevice);

  return {
    userAgent,
    deviceName,
    deviceType,
    platform,
    browser,
    timezone: cleanText(clientDevice.timezone, ""),
    language: cleanText(clientDevice.language, ""),
    location,
    isMobile: isMobileUserAgent || /mobile|tablet/i.test(deviceType),
  };
}

function browserFromUserAgent(userAgent) {
  if (/edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/chrome\//i.test(userAgent) && !/chromium/i.test(userAgent)) return "Chrome";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return "Safari";
  return "Unknown browser";
}

function platformFromUserAgent(userAgent) {
  if (/windows/i.test(userAgent)) return "Windows";
  if (/mac os|macintosh/i.test(userAgent)) return "macOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Unknown platform";
}

function locationFromRequest(request, clientDevice) {
  const parts = [
    request.get("cf-ipcity"),
    request.get("cf-region"),
    request.get("cf-ipcountry"),
  ].map((item) => cleanText(item)).filter(Boolean);
  if (parts.length) return parts.join(", ");
  return cleanText(clientDevice.location || clientDevice.timezone || "");
}

export async function getSecuritySetting() {
  return prisma.securitySetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export function publicDevice(device) {
  return {
    id: device.id,
    label: device.label,
    isActive: device.isActive,
    deviceName: device.deviceName || "",
    deviceType: device.deviceType || "",
    platform: device.platform || "",
    browser: device.browser || "",
    firstSeenAt: device.firstSeenAt,
    lastSeenAt: device.lastSeenAt,
    lastIpAddress: device.lastIpAddress,
    lastLocation: device.lastLocation || "",
    approvedAt: device.approvedAt,
    approvedBy: device.approvedBy ? {
      id: device.approvedBy.id,
      email: device.approvedBy.email,
      username: device.approvedBy.username || "",
    } : null,
  };
}

export function publicLoginEvent(event) {
  return {
    id: event.id,
    user: event.user ? {
      email: event.user.email,
      username: event.user.username || "",
      name: event.user.employee?.fullName || event.user.email,
    } : null,
    emailOrLogin: event.emailOrLogin || "",
    successful: event.successful,
    blockedReason: event.blockedReason || "",
    ipAddress: event.ipAddress || "",
    location: event.location || "",
    timezone: event.timezone || "",
    language: event.language || "",
    deviceName: event.deviceName || "",
    deviceType: event.deviceType || "",
    platform: event.platform || "",
    browser: event.browser || "",
    createdAt: event.createdAt,
  };
}

export async function recordLoginEvent(request, { user, loginDeviceId = null, successful, blockedReason = "" }) {
  const metadata = deviceMetadata(request);
  return prisma.loginEvent.create({
    data: {
      userId: user?.id || null,
      loginDeviceId,
      emailOrLogin: cleanText(request.body?.login || request.body?.email || user?.email || ""),
      successful,
      blockedReason,
      ipAddress: getRequestIp(request),
      location: metadata.location,
      timezone: metadata.timezone,
      language: metadata.language,
      deviceName: metadata.deviceName,
      deviceType: metadata.deviceType,
      platform: metadata.platform,
      browser: metadata.browser,
      userAgent: metadata.userAgent,
    },
  });
}

async function observeLoginDevice(request, metadata) {
  const deviceKey = getDeviceKey(request);
  if (!deviceKey) {
    throw httpError(403, "This machine is not registered for HRMS login. Ask admin to approve this browser/device.");
  }

  const fingerprintHash = deviceFingerprint(deviceKey);
  return prisma.loginDevice.upsert({
    where: { fingerprintHash },
    update: {
      deviceKey,
      lastSeenAt: new Date(),
      lastIpAddress: getRequestIp(request),
      lastLocation: metadata.location,
      lastUserAgent: metadata.userAgent,
      deviceName: metadata.deviceName,
      deviceType: metadata.deviceType,
      platform: metadata.platform,
      browser: metadata.browser,
    },
    create: {
      label: metadata.deviceName,
      deviceKey,
      fingerprintHash,
      isActive: false,
      lastSeenAt: new Date(),
      lastIpAddress: getRequestIp(request),
      lastLocation: metadata.location,
      lastUserAgent: metadata.userAgent,
      deviceName: metadata.deviceName,
      deviceType: metadata.deviceType,
      platform: metadata.platform,
      browser: metadata.browser,
    },
  });
}

export async function enforceLoginDevice(request) {
  const metadata = deviceMetadata(request);
  if (metadata.isMobile) {
    throw httpError(403, "HRMS login is not allowed from mobile or tablet devices.");
  }

  const device = await observeLoginDevice(request, metadata);

  const setting = await getSecuritySetting();
  if (setting.loginDeviceRestrictionEnabled && !device.isActive) {
    const error = httpError(403, "This machine is pending approval for HRMS login.");
    error.loginDeviceId = device.id;
    throw error;
  }

  return device.id;
}
