import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/require-auth.js";

const router = Router();
const offeredCandidatesCache = new Map();
const OFFERED_CANDIDATES_CACHE_MS = 10 * 60 * 1000;

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function fetchAtsOfferedCandidates(month) {
  const atsBaseUrl = trimTrailingSlash(process.env.ATS_BASE_URL || "http://127.0.0.1:5001");
  const token = process.env.ATS_HRMS_INTEGRATION_TOKEN || "";
  if (!token) {
    return { status: 503, body: { error: { message: "ATS integration token is not configured.", status: 503 } } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${atsBaseUrl}/api/integrations/hrms/offered-candidates?month=${encodeURIComponent(month)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        status: response.status,
        body: { error: { message: data.error || "Unable to fetch ATS offered candidates.", status: response.status } },
      };
    }
    return { status: 200, body: data };
  } catch (error) {
    return {
      status: 502,
      body: {
        error: {
          message: error.name === "AbortError" ? "ATS integration timed out." : "ATS integration is not reachable.",
          status: 502,
        },
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

router.use(requireAuth);

router.get("/offered-candidates", async (request, response) => {
  const month = request.query.month || currentMonth();
  const parsed = monthSchema.safeParse(month);
  if (!parsed.success) {
    return response.status(400).json({ error: { message: "Month must be in YYYY-MM format.", status: 400 } });
  }

  const cacheKey = parsed.data;
  const cached = offeredCandidatesCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < OFFERED_CANDIDATES_CACHE_MS) {
    return response.status(cached.status).json({ ...cached.body, cache: "hit" });
  }

  const result = await fetchAtsOfferedCandidates(parsed.data);
  if (result.status === 200) {
    offeredCandidatesCache.set(cacheKey, { ...result, createdAt: Date.now() });
  }
  return response.status(result.status).json({ ...result.body, cache: "miss" });
});

router.get("/reviews", (_request, response) => response.status(501).json({ error: { message: "Performance reviews are not implemented yet.", status: 501 } }));
router.get("/reviews/:id", (_request, response) => response.status(501).json({ error: { message: "Performance review detail is not implemented yet.", status: 501 } }));
router.post("/reviews", (_request, response) => response.status(501).json({ error: { message: "Performance review create is not implemented yet.", status: 501 } }));
router.patch("/reviews/:id", (_request, response) => response.status(501).json({ error: { message: "Performance review update is not implemented yet.", status: 501 } }));
router.get("/cycles/current", (_request, response) => response.status(501).json({ error: { message: "Current performance cycle is not implemented yet.", status: 501 } }));

export default router;
