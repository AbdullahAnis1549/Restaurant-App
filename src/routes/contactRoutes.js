import express from 'express';
import {
  submitContact,
  getAllContacts,
  replyContact,
  deleteContact,
} from '../controllers/contactController.js';
import { authVerify } from '../middlewares/authVerify.js';
import { adminProtected } from '../middlewares/adminProtected.js';

const router = express.Router();

router.post('/', submitContact);
router.get('/', authVerify, adminProtected, getAllContacts);
router.put('/:id/reply', authVerify, adminProtected, replyContact);
router.delete('/:id', authVerify, adminProtected, deleteContact);

export default router;
