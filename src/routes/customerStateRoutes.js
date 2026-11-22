import express from 'express';
import { authVerify } from '../middlewares/authVerify.js';
import { customerStateController } from '../controllers/customerStateController.js';
const router = express.Router();
router.use(authVerify);
router.get('/', customerStateController.get);
router.put('/', customerStateController.put);
export default router;
