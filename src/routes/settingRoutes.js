import express from 'express';
import { getSettings, updateSettings } from '../controllers/settingController.js';
import { authVerify } from '../middlewares/authVerify.js';
import { adminProtected } from '../middlewares/adminProtected.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();

router.get('/', getSettings);
router.put('/', authVerify, adminProtected, upload.single('logo'), updateSettings);

export default router;
