import express from 'express';
import {
  getAllPromos,
  createPromo,
  updatePromo,
  deletePromo,
} from '../controllers/promoController.js';
import { authVerify } from '../middlewares/authVerify.js';
import { adminProtected } from '../middlewares/adminProtected.js';

const router = express.Router();

router.use(authVerify, adminProtected);

router.get('/', getAllPromos);
router.post('/', createPromo);
router.put('/:id', updatePromo);
router.delete('/:id', deletePromo);

export default router;
