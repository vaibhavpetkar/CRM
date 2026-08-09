import { Request, Response } from 'express';

// Environment variables that can be managed via the UI
const MANAGEABLE_ENV_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
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
    
    // For now, we'll write to a .env file in the project root on the VPS
    // The deployment script should source this file before running docker compose
    
    const fs = await import('fs');
    const path = await import('path');
    
    const envPath = path.resolve(process.cwd(), '.env');
    
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
    
    // Update with new values
    Object.entries(envVars).forEach(([key, value]) => {
      if (value && value !== '•'.repeat(8)) {
        envMap.set(key, value);
      }
    });
    
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