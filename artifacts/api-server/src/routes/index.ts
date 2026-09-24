import { Router, type IRouter } from "express";
import healthRouter from "./health";
import promptlyRouter from "./promptly";

const router: IRouter = Router();

router.use(healthRouter);
router.use(promptlyRouter);

export default router;
