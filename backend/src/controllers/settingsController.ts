import { Request, Response } from 'express';

// Environment variables that can be managed via the UI
const MANAGEABLE_ENV_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_BUSINESS_CLIENT_ID',
  'GOOGLE_BUSINESS_CLIENT_SECRET',
  'GOOGLE_MEET_CLIENT_ID',
  'GOOGLE_MEET_CLIENT_SECRET',
  'EMAIL_SERVICE',
  'EMAIL_USER',
  'EMAIL_PASS',
  'EMAIL_FROM',
  'EMAIL_SECURE',
  'CLIENT_URL',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'DB_PASSWORD',
  'SUPER_ADMIN_EMAIL',
  'SUPER_ADMIN_PASSWORD',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
] as const;

type ManageableEnvVar = typeof MANAGEABLE_ENV_VARS[number];

// Mask sensitive values for display
const maskValue = (key: string, value: string | undefined): string => {
  if (!value) return '';
  const sensitiveKeys = ['SECRET', 'PASSWORD', 'PASS', 'KEY', 'TOKEN'];
  if (sensitiveKeys.some(s => key.includes(s))) {
    return '•'.repeat(8);
  }
  return value;
};

export const getEnvVars = async (_req: Request, res: Response) => {
  try {
    const envVars = MANAGEABLE_ENV_VARS.map((key) => ({
      key,
      value: maskValue(key, process.env[key]),
      isSet: Boolean(process.env[key]),
    }));
    return res.json({ envVars });
  } catch (error) {
    console.error('Get env vars error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateEnvVars = async (req: Request, res: Response) => {
  try {
    const { envVars } = req.body as { envVars: Record<string, string> };
    
    // Validate keys
    const invalidKeys = Object.keys(envVars).filter(key => !MANAGEABLE_ENV_VARS.includes(key as ManageableEnvVar));
    if (invalidKeys.length > 0) {
      return res.status(400).json({ message: `Invalid environment variables: ${invalidKeys.join(', ')}` });
    }

    // In a production Docker deployment, environment variables are typically set
    // at container startup via docker-compose or Kubernetes secrets.
    // This endpoint writes to a .env file that the VPS deployment script reads.
    // 
    // IMPORTANT: The backend runs in Docker at /usr/src/app, but the VPS deploy script
    // expects .env at the host project root. We use an env var to configure the path.
    
    const fs = await import('fs');
    const path = await import('path');
    
    // Use ENV_FILE_PATH if set (for Docker), otherwise fallback to cwd
    const envFilePath = process.env.ENV_FILE_PATH || path.resolve(process.cwd(), '.env');
    const envPath = path.resolve(envFilePath);
    
    // Read existing .env file
    let existingEnv = '';
    if (fs.existsSync(envPath)) {
      existingEnv = fs.readFileSync(envPath, 'utf-8');
    }
    
    // Parse existing env vars
    const envMap = new Map<string, string>();
    existingEnv.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim();
          envMap.set(key, value);
        }
      }
    });
    
    // Update with new values. Reject anything containing a newline outright
    // rather than writing it — a stray newline in a pasted secret would
    // otherwise corrupt the .env file (splits into an extra, unparseable
    // line) with no clear error, which is a much worse failure mode than
    // just telling the admin why it wasn't accepted.
    const badValueKeys: string[] = [];
    Object.entries(envVars).forEach(([key, rawValue]) => {
      const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
      if (!value) return;
      if (/[\r\n]/.test(value)) {
        badValueKeys.push(key);
        return;
      }
      if (value !== '•'.repeat(8)) {
        envMap.set(key, value);
      }
    });

    if (badValueKeys.length > 0) {
      return res.status(400).json({
        message: `These values contain a line break, which isn't allowed in a .env file (usually from pasting): ${badValueKeys.join(', ')}`,
      });
    }
    
    // Write back to .env file
    const newEnvContent = Array.from(envMap.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n';
    
    fs.writeFileSync(envPath, newEnvContent);
    
    return res.json({ message: 'Environment variables updated successfully. Restart containers to apply changes.' });
  } catch (error) {
    console.error('Update env vars error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};