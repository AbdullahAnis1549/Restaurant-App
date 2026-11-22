import { validText } from '../utils/authInput.js';
import { sendCrudError } from '../utils/crudErrors.js';
import Contact from '../models/Contact.js';
import { sendContactReplyEmail } from '../utils/nodemailer.js';

// @route   POST /api/contacts
// @access  Public
export const submitContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!validText(name, 100, true) || !validText(email, 254, true) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validText(subject, 150, true) || !validText(message, 4000, true) || (phone !== undefined && !validText(phone, 30))) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, subject, and message are required.',
      });
    }

    const contact = await Contact.create({
      name,
      email,
      phone: phone || '',
      subject,
      message,
      status: 'Pending',
    });

    res.status(201).json({
      success: true,
      message: 'Your inquiry has been submitted. Our team will contact you shortly.',
      data: { id: contact._id, status: contact.status, createdAt: contact.createdAt },
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   GET /api/contacts
// @access  Private / Admin Only
export const getAllContacts = async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts,
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   PUT /api/contacts/:id/reply
// @access  Private / Admin Only
export const replyContact = async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply) {
      return res.status(400).json({ success: false, message: 'Reply content is required' });
    }

    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Inquiry not found' });
    }

    contact.adminReply = reply;
    contact.status = 'Replied';
    contact.repliedAt = new Date();
    await contact.save();

    // Send email to customer asynchronously
    sendContactReplyEmail(contact).catch((err) =>
      console.error('[Contact Email Reply Error]:', err.message)
    );

    res.status(200).json({
      success: true,
      message: 'Reply sent and inquiry marked as Replied',
      data: contact,
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   DELETE /api/contacts/:id
// @access  Private / Admin Only
export const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Inquiry not found' });
    }
    res.status(200).json({ success: true, message: 'Inquiry deleted successfully' });
  } catch (error) {
    sendCrudError(res, error);
  }
};
