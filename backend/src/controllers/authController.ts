import { Request, Response } from 'express';
import User from '../models/User';
import Role from '../models/Role';
import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { OAuth2Client } from 'google-auth-library';
import { AuthRequest } from '../middleware/authMiddleware';
import { runUnscoped, runWithTenant } from '../tenancy/context';
import { createTrialCompany } from '../tenancy/provisioning';
import { seatLimitMessage } from '../utils/subscription';
import { getDefaultCompanyId } from '../tenancy/migration';
import { sendInviteEmail, sendResetPasswordEmail } from '../utils/mailer';

const roleInclude = { model: Role, as: 'role' };

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const generateToken = (userId: number): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET is not defined');
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ id: userId }, jwtSecret, { expiresIn: jwtExpiresIn } as SignOptions);
};

const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const safeParsePermissions = (permissions: string | undefined) => {
  if (!permissions) return [] as string[];
  try {
    return JSON.parse(permissions) as string[];
  } catch {
    return [] as string[];
  }
};

const userPublicFields = (user: User) => {
  const role = (user as any).role;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    roleId: user.roleId,
    companyId: user.companyId,
    isSuperAdmin: user.isSuperAdmin,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    role: role
      ? {
          id: role.id,
          name: role.name,
          permissions: safeParsePermissions(role.permissions),
        }
      : null,
  };
};

// ─── Register ─────────────────────────────────────────────────────────────────

export const register = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'firstName, lastName, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const hashedPassword = await hashPassword(password);

    // Self-registration is intentionally limited: no roleId/companyId escalation,
    // no super-admin minting, and the account is inactive until an admin invites
    // (or provisions) it. Super-admin provisioning happens only in server.ts/seed.ts.
    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || null,
      isSuperAdmin: false,
      isActive: false,
      emailVerified: false,
      phoneVerified: false,
      // Lands in the original company until self-serve company signup exists.
      companyId: await getDefaultCompanyId(),
    });

    return res.status(201).json({
      message: 'User registered successfully. An administrator must activate your account before you can log in.',
      user: userPublicFields(user),
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Server error during registration' });
  }
};

// ─── Company signup (15-day free trial) ───────────────────────────────────────

export const signupCompany = async (req: Request, res: Response) => {
  try {
    const { companyName, firstName, lastName, email, password, phone } = req.body || {};

    if (!companyName?.trim() || !firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: 'Company name, first name, last name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address' });
    }
    // Emails are unique across every company.
    if (await User.findOne({ where: { email: normalizedEmail } })) {
      return res.status(400).json({ message: 'An account with this email already exists. Sign in instead.' });
    }

    const { company, roles } = await createTrialCompany(String(companyName).trim().slice(0, 100));
    const user = await runWithTenant(company.id, async () => {
      const created = await User.create({
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: normalizedEmail,
        password: await hashPassword(password),
        phone: phone || null,
        roleId: roles['Administrator']?.id ?? null,
        isSuperAdmin: false,
        isActive: true,
        emailVerified: false,
        phoneVerified: false,
        lastLogin: new Date(),
      });
      return User.findByPk(created.id, { include: [roleInclude] });
    });

    return res.status(201).json({
      message: 'Your company is ready. Your 15-day free trial has started.',
      token: generateToken(user!.id),
      user: userPublicFields(user!),
    });
  } catch (error) {
    console.error('Company signup error:', error);
    return res.status(500).json({ message: 'Server error during signup' });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ where: { email }, include: [roleInclude] });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.validatePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account has been deactivated. Contact support.' });
    }

    await user.update({ lastLogin: new Date() });

    const token = generateToken(user.id);

    return res.json({
      message: 'Login successful',
      token,
      user: userPublicFields(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login' });
  }
};

// ─── Google OAuth Login ───────────────────────────────────────────────────────

export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Google token is required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Invalid Google token payload' });
    }

    const { email, given_name, family_name } = payload;
    let user = await User.findOne({ where: { email }, include: [roleInclude] });

    // Google sign-in only signs in existing accounts. New people join by
    // signing up their company or through an invitation, never by landing
    // in someone else's company.
    if (!user) {
      return res.status(403).json({
        message: 'No account found for this Google email. Sign up your company or ask your administrator for an invitation.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account has been deactivated.' });
    }

    await user.update({ lastLogin: new Date() });

    const jwtToken = generateToken(user.id);

    return res.json({
      message: 'Google login successful',
      token: jwtToken,
      user: userPublicFields(user),
    });
  } catch (error) {
    console.error('Google Login Error:', error);
    return res.status(400).json({ message: 'Google authentication failed' });
  }
};

// ─── Send Invitation ──────────────────────────────────────────────────────────

export const sendInvitation = async (req: Request, res: Response) => {
  try {
    const { email, firstName = 'Invited', lastName = 'User', roleId } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required to send an invitation' });
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Emails are unique across all companies, so look outside this one too.
    let user = await runUnscoped(() => User.findOne({ where: { email } }));

    if (user && user.companyId !== (req as any).user?.companyId) {
      return res.status(400).json({ message: 'This email is already registered with another company.' });
    }

    if (user) {
      if (user.emailVerified) {
        return res.status(400).json({ message: 'User is already registered and active.' });
      }
      await user.update({
        inviteToken,
        inviteExpires,
        roleId: roleId || user.roleId,
      });
    } else {
      const seatMessage = await seatLimitMessage((req as any).company);
      if (seatMessage) return res.status(403).json({ message: seatMessage });
      const dummyPassword = await hashPassword(crypto.randomBytes(16).toString('hex'));
      user = await User.create({
        firstName,
        lastName,
        email,
        password: dummyPassword,
        roleId: roleId || null,
        isSuperAdmin: false,
        isActive: true,
        emailVerified: false,
        phoneVerified: false,
        inviteToken,
        inviteExpires,
      });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const inviteUrl = `${clientUrl}/accept-invite?token=${inviteToken}`;
    const emailSent = await sendInviteEmail(email, inviteUrl, firstName, lastName);

    return res.status(200).json({
      message: emailSent ? 'Invitation email sent successfully' : 'Invitation generated. Email not sent because SMTP is not configured.',
      inviteUrl,
      inviteToken,
      emailSent,
      user: userPublicFields(user),
    });
  } catch (error) {
    console.error('Send invitation error:', error);
    return res.status(500).json({ message: 'Server error during invitation' });
  }
};

// ─── Verify Invitation Token ──────────────────────────────────────────────────

export const verifyInvitation = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      where: {
        inviteToken: token,
        inviteExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired invitation link' });
    }

    return res.json({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  } catch (error) {
    console.error('Verify invitation error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Accept Invitation & Create Password ──────────────────────────────────────

export const acceptInvitation = async (req: Request, res: Response) => {
  try {
    const { token, password, firstName, lastName } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Invitation token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({
      where: {
        inviteToken: token,
        inviteExpires: { [Op.gt]: new Date() },
      },
      include: [roleInclude],
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired invitation token' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account has been deactivated. Contact your administrator.' });
    }

    const hashedPassword = await hashPassword(password);

    await user.update({
      password: hashedPassword,
      firstName: firstName || user.firstName,
      lastName: lastName || user.lastName,
      emailVerified: true,
      inviteToken: null,
      inviteExpires: null,
      lastLogin: new Date(),
    });

    const jwtToken = generateToken(user.id);

    return res.json({
      message: 'Invitation accepted successfully. You are now logged in.',
      token: jwtToken,
      user: userPublicFields(user),
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Get Current User ─────────────────────────────────────────────────────────

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    return res.json({ user: userPublicFields(user) });
  } catch (error) {
    console.error('getMe error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Verify Email ─────────────────────────────────────────────────────────────

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    await user.update({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });

    return res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.json({ message: 'If your email is registered, you will receive a password reset link' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000);

    await user.update({
      passwordResetToken: resetToken,
      passwordResetExpires: resetTokenExpires,
    });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;
    const emailSent = await sendResetPasswordEmail(email, resetUrl, user.firstName);

    return res.json({
      message: 'If your email is registered, you will receive a password reset link',
      // Only surface the raw link/token when email isn't configured (dev convenience), never in production.
      ...(!emailSent && process.env.NODE_ENV !== 'production' && { resetUrl, resetToken }),
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const forgotPassword = requestPasswordReset;

// ─── Reset Password ───────────────────────────────────────────────────────────

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'New password is required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const hashedPassword = await hashPassword(password);

    await user.update({
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    return res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are required' });
    }

    const isMatch = await user.validatePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const hashedPassword = await hashPassword(newPassword);
    await user.update({ password: hashedPassword });

    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};