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
      currency: 'INR',
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

    const {
      name,
      email,
      phone,
      address,
      website,
      industry,
      employeeCount,
      currency,
      whatsapp,
      instagram,
      facebook,
      linkedin,
      youtube,
      twitter,
      quoteMessageTemplate,
    } = req.body;

    if (currency && !SUPPORTED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ message: `Unsupported currency. Use one of: ${SUPPORTED_CURRENCIES.join(', ')}` });
    }

    // Use !== undefined (not ??) so a field can be explicitly cleared by
    // sending '' / null, consistent with the rest of this app's update
    // handlers (see dealController.updateDeal's norm() helper).
    const norm = (v: any) => (v === '' ? null : v);
    await company.update({
      name: name ?? company.name,
      email: email ?? company.email,
      phone: phone ?? company.phone,
      address: address ?? company.address,
      website: website ?? company.website,
      industry: industry ?? company.industry,
      employeeCount: employeeCount ?? company.employeeCount,
      currency: currency ?? company.currency,
      whatsapp: whatsapp !== undefined ? norm(whatsapp) : company.whatsapp,
      instagram: instagram !== undefined ? norm(instagram) : company.instagram,
      facebook: facebook !== undefined ? norm(facebook) : company.facebook,
      linkedin: linkedin !== undefined ? norm(linkedin) : company.linkedin,
      youtube: youtube !== undefined ? norm(youtube) : company.youtube,
      twitter: twitter !== undefined ? norm(twitter) : company.twitter,
      quoteMessageTemplate: quoteMessageTemplate !== undefined ? norm(quoteMessageTemplate) : company.quoteMessageTemplate,
    });

    return res.json({ message: 'Company settings updated successfully', company });
  } catch (error) {
    console.error('Update company error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
