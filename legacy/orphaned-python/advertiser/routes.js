import { createRouter } from "next-connect";
import advertiserApiRouter from "./advertiser/api_endpoints";

// Setup the Next.js API router
const router = createRouter();

// Mount the advertiser API endpoints
router.use("/api/advertiser", advertiserApiRouter);

export default router;
