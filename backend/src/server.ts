import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import sequelize from './config/database';
import User from './models/User';
import Role from './models/Role';
import { DEFAULT_ROLES } from './config/permissions';
import logger from './utils/logger';
import { errorHandler } from './utils/errorHandler';
import path from 'path';
import http from 'http';
import { initRealtime } from './realtime/socket';

// Import routes
import authRoutes from './routes/authRoutes';
import leadRoutes from './routes/leadRoutes';
import dealRoutes from './routes/dealRoutes';
import contactRoutes from './routes/contactRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import quoteRoutes from './routes/quoteRoutes';
import meetingRoutes from './routes/meetingRoutes';
import taskRoutes from './routes/taskRoutes';
import campaignRoutes from './routes/campaignRoutes';
import templateRoutes from './routes/templateRoutes';
import teamRoutes from './routes/teamRoutes';
import userRoutes from './routes/userRoutes';
import roleRoutes from './routes/roleRoutes';
import activityLogRoutes from './routes/activityLogRoutes';
import recycleBinRoutes from './routes/recycleBinRoutes';
import paymentRoutes from './routes/paymentRoutes';
import notificationRoutes from './routes/notificationRoutes';
import searchRoutes from './routes/searchRoutes';
import itemRoutes from './routes/itemRoutes';
import itemCategoryRoutes from './routes/itemCategoryRoutes';
import taxMasterRoutes from './routes/taxMasterRoutes';
import companyRoutes from './routes/companyRoutes';
import attachmentRoutes from './routes/attachmentRoutes';

// Import models in dependency order before sync
import './models/Company';
import './models/Role';
import './models/Permission';
import './models/User';
import './models/Contact';
import './models/Lead';
import './models/Deal';
import './models/Employee';
import './models/Invoice';
import './models/Quote';
import './models/Meeting';
import './models/Task';
import './models/Campaign';
import './models/Template';
import './models/ActivityLog';
import './models/Payment';
import './models/Notification';
import './models/Sequence';
import './models/ItemCategory';
import './models/TaxMaster';
import './models/Item';
import './models/LeadProduct';
import './models/LeadTax';
import './models/QuoteProduct';
import './models/QuoteTax';
import './models/Attachment';

// Import associations AFTER all models — defines belongsTo/hasMany relationships
import './models/associations';

// Import middleware
import { protect } from './middleware/authMiddleware';

dotenv.config();

const app: Express = express();
const httpServer = http.createServer(app);
const port = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:3001',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., curl, Postman, mobile apps)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: express.NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/recycle-bin', recycleBinRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/item-categories', itemCategoryRoutes);
app.use('/api/taxes', taxMasterRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/attachments', attachmentRoutes);

// Serve uploaded files (attachments) statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected profile route
app.get('/api/profile', protect, (req: Request & { user?: any }, res: Response) => {
  res.json({ user: req.user });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Route not found' });
});

// ─── Central Error Handler ──────────────────────────────────────────────────
// Must be registered last. Catches everything asyncHandler-wrapped controllers
// pass to next(), plus any Sequelize errors, and normalizes the response shape.
app.use(errorHandler);

// ─── Database + Server Start ─────────────────────────────────────────────────

const createSuperAdmin = async (adminRoleId?: number) => {
  const superEmail = process.env.SUPER_ADMIN_EMAIL;
  const superPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (!superEmail || !superPassword) {
    return;
  }

  const existing = await User.findOne({ where: { email: superEmail } });
  if (existing) {
    // Make sure the account stays a super admin & keeps a role even if it already existed.
    await existing.update({
      isSuperAdmin: true,
      isActive: true,
      roleId: existing.roleId ?? adminRoleId ?? null,
    });
    return;
  }

  const hashedPassword = await bcrypt.hash(superPassword, 10);
  await User.create({
    firstName: 'Super',
    lastName: 'Admin',
    email: superEmail,
    password: hashedPassword,
    isSuperAdmin: true,
    isActive: true,
    emailVerified: true,
    phoneVerified: true,
    roleId: adminRoleId || null,
  });
};

const seedDefaultRoles = async (): Promise<Record<string, Role>> => {
  const roles: Record<string, Role> = {};
  for (const roleDef of DEFAULT_ROLES) {
    const [role] = await Role.findOrCreate({
      where: { name: roleDef.name },
      defaults: {
        name: roleDef.name,
        description: roleDef.description,
        permissions: JSON.stringify(roleDef.permissions),
        isActive: true,
      },
    });
    roles[roleDef.name] = role;
  }
  return roles;
};

const startServer = async () => {
  try {
    await sequelize.authenticate();
    logger.info('✅ Database connection established successfully.');

    // Sync models — use alter:true in dev to apply schema changes
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('✅ Database synchronized.');

    // Seed default roles and the super admin account on every boot.
    // Both are idempotent (skip/update anything that already exists), so this is
    // safe to run every time the server starts, not just once via `npm run seed:admin`.
    const roles = await seedDefaultRoles();
    await createSuperAdmin(roles['Administrator']?.id);

    await initRealtime(httpServer);

    httpServer.listen(port, () => {
      logger.info(`🚀 Server is running on http://localhost:${port}`);
      logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error(`❌ Unable to connect to the database: ${error}`);
    process.exit(1);
  }
};

startServer();

export default app;