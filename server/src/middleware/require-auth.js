import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

function getToken(request) {
  const header = request.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return request.cookies?.hrguru_session;
}

export async function requireAuth(request, response, next) {
  try {
    const token = getToken(request);
    if (!token) return response.status(401).json({ error: { message: "Unauthenticated", status: 401 } });

    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-only-hrguru-secret");
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        mustChangePassword: true,
        status: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            designation: true,
            department: true,
            managerId: true,
          },
        },
      },
    });

    if (!user || user.status !== "active") {
      return response.status(401).json({ error: { message: "Unauthenticated", status: 401 } });
    }

    if (user.role === "employee" && !payload.impersonatedBy) {
      const now = new Date();
      const minutes = (now.getHours() * 60) + now.getMinutes();
      if (minutes < 510) {
        return response.status(403).json({ error: { message: "Employee login opens at 8:30 AM.", status: 403 } });
      }
      if (minutes >= 1200) {
        return response.status(403).json({ error: { message: "Employee login is closed after 8:00 PM.", status: 403 } });
      }
    }

    user.impersonatedBy = payload.impersonatedBy || null;
    request.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return response.status(401).json({ error: { message: "Unauthenticated", status: 401 } });
    }
    next(error);
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.user) return response.status(401).json({ error: { message: "Unauthenticated", status: 401 } });
    if (!roles.includes(request.user.role)) return response.status(403).json({ error: { message: "Forbidden", status: 403 } });
    next();
  };
}
