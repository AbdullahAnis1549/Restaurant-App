import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

export const escapeEmailText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
let transporter;

const createTransporter = () => {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_PASS !== 'mock_email_app_password') {
    return nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    if (process.env.NODE_ENV === 'production') return { sendMail: async () => { throw new Error('Email delivery is not configured.'); } };
    // Development fallback (Mock / ethereal or console logger)
    return {
      sendMail: async (options) => {
        console.log('\n--- [NODEMAILER SIMULATED EMAIL] ---');
        console.log('Recipient and message content are omitted from logs.');
        console.log('--- Content sent successfully (configure .env EMAIL_PASS for real SMTP) ---\n');
        return { messageId: `mock-msg-${Date.now()}` };
      },
    };
  }
};

transporter = createTransporter();

export const sendWelcomeEmail = async (user) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Zaykora Royal Restaurant" <welcome@zaykora.com>',
      to: user.email,
      subject: 'Welcome to Zaykora Royal Dining 🍽️',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #0A0907; color: #FFFFFF; padding: 25px; border-radius: 12px; border: 1px solid #D4AF37;">
          <h1 style="color: #D4AF37; text-align: center; margin-bottom: 5px;">Zaykora</h1>
          <p style="text-align: center; color: #A0A0A0; font-size: 13px; letter-spacing: 2px;">THE ROYAL DINING EXPERIENCE</p>
          <hr style="border: none; border-top: 1px solid #332B18; margin: 20px 0;" />
          <h3 style="color: #F8F8F8;">Hello ${escapeEmailText(user.name)},</h3>
          <p style="color: #C0C0C0; line-height: 1.6;">
            Welcome to the Zaykora family! Your account has been successfully created. Explore our chef's hand-crafted delicacies and enjoy exclusive royal rewards on every order.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="background: #D4AF37; color: #0A0907; padding: 12px 28px; font-weight: bold; border-radius: 8px; text-decoration: none; display: inline-block;">
              Explore Menu Now
            </span>
          </div>
          <p style="color: #666; font-size: 12px; text-align: center;">If you did not sign up for this account, please ignore this email.</p>
        </div>
      `,
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`[Nodemailer Welcome Error]: ${error.code || error.name}`);
  }
};

export const sendOrderConfirmationEmail = async (order) => {
  try {
    const itemsRows = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 10px 8px; border-bottom: 1px solid #222; color: #FFF;">${escapeEmailText(item.name)}</td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #222; color: #DDD; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #222; color: #D4AF37; text-align: right;">Rs. ${item.price * item.quantity}</td>
        </tr>
      `
      )
      .join('');

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Zaykora Orders" <orders@zaykora.com>',
      to: order.customerEmail,
      subject: `Order Confirmation #${order._id.toString().slice(-6).toUpperCase()} - Zaykora Royal Palace`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; background: #0A0907; color: #FFFFFF; padding: 25px; border-radius: 12px; border: 1px solid #D4AF37;">
          <h1 style="color: #D4AF37; text-align: center; margin-bottom: 5px;">Zaykora</h1>
          <p style="text-align: center; color: #A0A0A0; font-size: 12px; letter-spacing: 2px;">ROYAL PASSION ON A PLATE</p>
          <hr style="border: none; border-top: 1px solid #332B18; margin: 20px 0;" />

          <h2 style="color: #FFF; font-size: 20px; margin-bottom: 4px;">Your order has been placed successfully, ${escapeEmailText(order.customerName)}!</h2>
          <p style="color: #999; font-size: 14px; margin-top: 0;">Order ID: <b style="color: #D4AF37;">#${order._id.toString().slice(-6).toUpperCase()}</b> | Status: <b style="color: #F5C66B;">Confirmed</b></p>

          <div style="background: #1B160C; border: 1px solid #F5C66B; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <p style="color: #F5C66B; font-weight: bold; font-size: 16px; margin: 0 0 6px 0;">
              ⏱️ Estimated Delivery: 30–60 Minutes
            </p>
            <p style="color: #E6DCB8; font-size: 13px; margin: 0; line-height: 1.5;">
              Our delivery rider will contact you when your order is on the way.
            </p>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #3D311A;">
              ${order.paymentMethod === 'Cash on Delivery'
                ? `<p style="color: #FFA726; font-weight: bold; font-size: 13px; margin: 0;">💵 Payment: Cash on Delivery — Please keep <b>Rs. ${order.grandTotal}</b> cash ready for our rider.</p>`
                : `<p style="color: #4ECA77; font-weight: bold; font-size: 13px; margin: 0;">💳 Payment: Paid Online via Card (Rs. ${order.grandTotal}) — No payment needed at door.</p>`
              }
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="border-bottom: 2px solid #D4AF37; color: #D4AF37; font-size: 13px; text-transform: uppercase;">
                <th style="padding: 8px; text-align: left;">Dish</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #AAA; font-size: 14px;">
              <span>Subtotal:</span>
              <span style="color: #FFF;">Rs. ${order.subtotal}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #AAA; font-size: 14px;">
              <span>Delivery Fee:</span>
              <span style="color: #FFF;">${order.deliveryFee === 0 ? 'FREE' : `Rs. ${order.deliveryFee}`}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #444; font-size: 18px; font-weight: bold;">
              <span style="color: #D4AF37;">Grand Total:</span>
              <span style="color: #D4AF37;">Rs. ${order.grandTotal}</span>
            </div>
          </div>

          <div style="background: #14120D; border: 1px solid #2B2414; padding: 15px; border-radius: 8px; margin-top: 25px;">
            <h4 style="color: #D4AF37; margin: 0 0 8px 0; font-size: 14px;">Delivery Address:</h4>
            <p style="color: #CCC; margin: 0; font-size: 13px;">${escapeEmailText(order.deliveryAddress)}</p>
            <p style="color: #999; margin: 4px 0 0 0; font-size: 12px;">Contact Phone: ${escapeEmailText(order.customerPhone)}</p>
            <p style="color: #999; margin: 2px 0 0 0; font-size: 12px;">Payment Method: ${escapeEmailText(order.paymentMethod)}</p>
          </div>

          <p style="color: #777; font-size: 12px; text-align: center; margin-top: 25px;">
            Have questions? Contact our royal concierge 24/7 at support@zaykora.com.
          </p>
        </div>
      `,
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`[Nodemailer Order Confirmation Error]: ${error.code || error.name}`);
  }
};

export const sendOrderDeliveredEmail = async (order) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Zaykora Orders" <orders@zaykora.com>',
      to: order.customerEmail,
      subject: `Order #${order._id.toString().slice(-6).toUpperCase()} Delivered - Thanks for Ordering! - Zaykora Royal Palace`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #0A0907; color: #FFFFFF; padding: 25px; border-radius: 12px; border: 1px solid #D4AF37;">
          <h1 style="color: #D4AF37; text-align: center; margin-bottom: 5px;">Zaykora</h1>
          <p style="text-align: center; color: #A0A0A0; font-size: 12px; letter-spacing: 2px;">ROYAL PASSION ON A PLATE</p>
          <hr style="border: none; border-top: 1px solid #332B18; margin: 20px 0;" />

          <h2 style="color: #4ECA77; font-size: 22px; text-align: center; margin-bottom: 4px;">
            🎉 Thanks for Ordering, ${escapeEmailText(order.customerName)}!
          </h2>
          <p style="color: #D4AF37; font-size: 15px; text-align: center; margin-top: 2px; font-weight: bold;">
            ✓ Your Royal Feast Has Been Successfully Delivered!
          </p>
          <p style="color: #CCC; font-size: 14px; text-align: center; line-height: 1.6; margin-top: 16px;">
            Thank you for ordering with Zaykora Royal Palace. Your order has been delivered successfully, and we hope you enjoy every bite.
          </p>

          <div style="background: #15110A; border: 1px solid #2F2615; border-radius: 10px; padding: 18px; margin: 22px 0; text-align: center;">
            <p style="color: #D4AF37; margin: 0; font-size: 16px; font-weight: bold;">
              Grand Total: Rs. ${order.grandTotal}
            </p>
            <p style="color: #4ECA77; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">
              ✓ Order: Delivered | Payment: ${order.isPaid || order.paymentStatus === 'Paid' ? 'Paid' : 'Pending'} (${escapeEmailText(order.paymentMethod)})
            </p>
            <p style="color: #888; margin: 4px 0 0 0; font-size: 12px;">
              Delivered to: ${escapeEmailText(order.deliveryAddress)}
            </p>
          </div>

          <p style="color: #888; font-size: 12px; text-align: center; margin-top: 25px;">
            Thank you for dining with Zaykora Royal Palace. We look forward to serving you again soon!
          </p>
        </div>
      `,
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`[Nodemailer Delivered Email Error]: ${error.code || error.name}`);
  }
};

export const sendOrderCancelledEmail = async (order) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Zaykora Orders" <orders@zaykora.com>',
      to: order.customerEmail,
      subject: `Order #${order._id.toString().slice(-6).toUpperCase()} Cancelled - Zaykora`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #0A0907; color: #FFFFFF; padding: 25px; border-radius: 12px; border: 1px solid #FF5B64;">
          <h1 style="color: #D4AF37; text-align: center; margin-bottom: 5px;">Zaykora</h1>
          <p style="text-align: center; color: #A0A0A0; font-size: 12px; letter-spacing: 2px;">ROYAL PASSION ON A PLATE</p>
          <hr style="border: none; border-top: 1px solid #332B18; margin: 20px 0;" />

          <h2 style="color: #FF5B64; font-size: 18px;">
            Notice: Order #${order._id.toString().slice(-8).toUpperCase()} Cancelled
          </h2>
          <p style="color: #CCC; font-size: 14px; line-height: 1.6;">
            Dear ${escapeEmailText(order.customerName)}, we regret to inform you that your order could not be fulfilled at this time. If you have been charged, an immediate refund will be credited.
          </p>

          <p style="color: #777; font-size: 12px; text-align: center; margin-top: 25px;">
            For further queries, please contact support through the app.
          </p>
        </div>
      `,
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`[Nodemailer Cancelled Email Error]: ${error.code || error.name}`);
  }
};

export const sendPasswordResetOTPEmail = async (user, otp) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Zaykora Royal Restaurant" <welcome@zaykora.com>',
      to: user.email,
      subject: 'Password Reset Verification Code - Zaykora Royal Palace',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; background: #0A0907; color: #FFFFFF; padding: 28px; border-radius: 14px; border: 1px solid #D4AF37;">
          <div style="text-align:center; margin-bottom: 18px;">
            <h1 style="color: #D4AF37; margin: 0; font-size: 32px; letter-spacing: 1px;">Zaykora Royal Palace</h1>
            <p style="color: #B8A778; margin: 6px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Secure Account Verification</p>
          </div>
          <hr style="border: none; border-top: 1px solid #332B18; margin: 20px 0;" />
          <h2 style="color: #FFF0CC; font-size: 22px; margin: 0 0 10px;">Password Reset Verification</h2>
          <p style="color: #D6C9A8; line-height: 1.7; font-size: 14px; margin: 0 0 18px;">
            We received a request to reset the password for your Zaykora account. Use the verification code below to continue.
          </p>
          <div style="background: linear-gradient(180deg, #1B160C 0%, #141109 100%); border: 1px solid #D4AF37; border-radius: 12px; padding: 22px; text-align: center; margin: 22px 0;">
            <p style="color: #F5C66B; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 10px;">Your 6-Digit Verification Code</p>
            <div style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #FFF4D6; background: #0A0907; border: 1px dashed #5C4720; border-radius: 10px; padding: 16px 12px; display: inline-block;">
              ${otp}
            </div>
            <p style="color: #E6DCB8; font-size: 13px; margin: 14px 0 0;">This code expires in <strong style="color:#F5C66B;">5 minutes</strong>.</p>
          </div>
          <div style="background: #15110A; border: 1px solid #2F2615; border-radius: 10px; padding: 14px 16px; margin-top: 18px;">
            <p style="color: #CFC2A1; font-size: 13px; line-height: 1.6; margin: 0;">
              <strong style="color:#F5C66B;">Security notice:</strong> If you did not request this password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
          </div>
          <p style="color: #7E735C; font-size: 12px; text-align: center; margin-top: 22px;">
            For your security, never share this code with anyone. Zaykora support will never ask for your password or verification code.
          </p>
        </div>
      `,
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`[Nodemailer Password Reset OTP Error]: ${error.code || error.name}`);
    throw error;
  }
};

export const sendContactReplyEmail = async (contact) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Zaykora Customer Care" <support@zaykora.com>',
      to: contact.email,
      subject: `Re: ${escapeEmailText(contact.subject)} - Zaykora Royal Restaurant`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #0A0907; color: #FFFFFF; padding: 25px; border-radius: 12px; border: 1px solid #D4AF37;">
          <h2 style="color: #D4AF37;">Response to Your Inquiry</h2>
          <p style="color: #AAA;">Dear ${escapeEmailText(contact.name)},</p>
          <div style="background: #14120D; border-left: 3px solid #D4AF37; padding: 12px; margin: 15px 0;">
            <p style="color: #888; font-size: 12px; margin: 0 0 5px 0;">Your original message:</p>
            <p style="color: #CCC; font-style: italic; margin: 0;">"${escapeEmailText(contact.message)}"</p>
          </div>
          <div style="margin-top: 20px;">
            <p style="color: #FFF; font-size: 15px; line-height: 1.6;">${escapeEmailText(contact.adminReply)}</p>
          </div>
          <hr style="border: none; border-top: 1px solid #332B18; margin: 25px 0;" />
          <p style="color: #888; font-size: 12px; text-align: center;">Zaykora Royal Restaurant Concierge Team</p>
        </div>
      `,
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`[Nodemailer Contact Reply Error]: ${error.code || error.name}`);
  }
};


export const emailDeliveryAvailable=()=>Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS && !/^(mock_|your_)/i.test(process.env.EMAIL_PASS));
export async function sendVerificationEmail(user,code){if(!emailDeliveryAvailable())throw Error('Email delivery is not configured.');return transporter.sendMail({from:process.env.EMAIL_FROM||process.env.EMAIL_USER,to:user.email,subject:'Verify your Zaykora email',html:'<p>Your Zaykora email verification code is <strong>'+escapeEmailText(code)+'</strong>.</p><p>It expires in 10 minutes. Do not share it.</p>'});}
