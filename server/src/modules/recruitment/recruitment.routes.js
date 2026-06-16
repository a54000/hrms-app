import { Router } from "express";

const router = Router();

router.get("/candidates", (_request, response) => response.status(501).json({ error: { message: "Candidate list is not implemented yet.", status: 501 } }));
router.post("/candidates", (_request, response) => response.status(501).json({ error: { message: "Candidate create is not implemented yet.", status: 501 } }));
router.patch("/candidates/:id", (_request, response) => response.status(501).json({ error: { message: "Candidate update is not implemented yet.", status: 501 } }));
router.patch("/candidates/:id/stage", (_request, response) => response.status(501).json({ error: { message: "Candidate stage update is not implemented yet.", status: 501 } }));
router.post("/candidates/:id/convert-to-employee", (_request, response) => response.status(501).json({ error: { message: "Candidate conversion is not implemented yet.", status: 501 } }));

export default router;
