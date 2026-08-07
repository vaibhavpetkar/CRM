import { Request, Response } from 'express';
import Company from '../models/Company';

// This app manages a single organization's settings (name, currency, etc.) under
// Settings > Company. We treat the first Company row as that singleton record,
// creating it on first access if it doesn't exist yet.
const getOrCreateCompany = async () => {
  let company = await Company.findOne({ order: [['id', 'ASC']] });
  if (!company) {
    company = await Company.create({
      name: 'My Company',
      currency: 'USD',
      isActive: true,
    });
  }
  return company;
};

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'JPY', 'CNY', 'AED', 'SGD'];

export const getCompany = async (_req: Request, res: Response) => {
  try {
    const company = await getOrCreateCompany();
    return res.json(company);
  } catch (error) {
    console.error('Get company error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateCompany = async (req: Request, res: Response) => {
  try {
    const company = await getOrCreateCompany();

    const { name, email, phone, address, website, industry, employeeCount, currency } = req.body;

    if (currency && !SUPPORTED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ message: `Unsupported currency. Use one of: ${SUPPORTED_CURRENCIES.join(', ')}` });
    }

    await company.update({
      name: name ?? company.name,
      email: email ?? company.email,
      phone: phone ?? company.phone,
      address: address ?? company.address,
      website: website ?? company.website,
      industry: industry ?? company.industry,
      employeeCount: employeeCount ?? company.employeeCount,
      currency: currency ?? company.currency,
    });

    return res.json({ message: 'Company settings updated successfully', company });
  } catch (error) {
    console.error('Update company error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
