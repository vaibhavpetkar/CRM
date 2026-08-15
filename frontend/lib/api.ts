const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('crm_token');
}

export function setAuthToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('crm_token', token);
    // Mirrored into a cookie (readable by proxy.ts) so unauthenticated users
    // are redirected to /login before any protected page ever renders.
    document.cookie = `crm_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  }
}

export function removeAuthToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    document.cookie = 'crm_token=; path=/; max-age=0';
  }
}

export function getStoredUser(): any | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('crm_user');
  return user ? JSON.parse(user) : null;
}

export function setStoredUser(user: any) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('crm_user', JSON.stringify(user));
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (err) {
    // Network failure (backend down, no connectivity) — don't mask it as a 500.
    throw new Error('Network error: could not reach the server. Check your connection and try again.');
  }

  const contentType = response.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  } else if (response.ok) {
    data = await response.text().catch(() => '');
  }

  if (!response.ok) {
    const message =
      (data && data.message) ||
      (typeof data === 'string' && data) ||
      (contentType.includes('application/json')
        ? `Request failed with status ${response.status}`
        : `Request failed with status ${response.status} (non-JSON response — the server may be returning an error page)`);
    throw new Error(message);
  }

  return data as T;
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  login: async (credentials: any) => {
    const data = await request<{ message: string; token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (data.token) {
      setAuthToken(data.token);
      setStoredUser(data.user);
    }
    return data;
  },

  register: async (userData: any) => {
    const data = await request<{ message: string; token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    if (data.token) {
      setAuthToken(data.token);
      setStoredUser(data.user);
    }
    return data;
  },

  googleLogin: async (token: string) => {
    const data = await request<{ message: string; token: string; user: any }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (data.token) {
      setAuthToken(data.token);
      setStoredUser(data.user);
    }
    return data;
  },

  sendInvite: async (inviteData: { email: string; firstName?: string; lastName?: string; roleId?: number }) => {
    return request<{ message: string; inviteUrl: string; inviteToken: string; user: any }>('/auth/invite', {
      method: 'POST',
      body: JSON.stringify(inviteData),
    });
  },

  verifyInvite: async (token: string) => {
    return request<{ email: string; firstName: string; lastName: string }>(`/auth/invite/${token}`);
  },

  acceptInvite: async (payload: { token: string; password: string; firstName?: string; lastName?: string }) => {
    const data = await request<{ message: string; token: string; user: any }>('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.token) {
      setAuthToken(data.token);
      setStoredUser(data.user);
    }
    return data;
  },

  forgotPassword: async (email: string) => {
    return request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  resetPassword: async (token: string, password: string) => {
    return request<{ message: string }>(`/auth/reset-password/${token}`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    return request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  getMe: async () => {
    const data = await request<{ user: any }>('/auth/me');
    if (data.user) {
      setStoredUser(data.user);
    }
    return data.user;
  },

  logout: () => {
    removeAuthToken();
  },
};

// ─── Team API ─────────────────────────────────────────────────────────────────

export const teamApi = {
  getMembers: async (params: { search?: string; department?: string; status?: string; roleId?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.department && params.department !== 'all') query.append('department', params.department);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    if (params.roleId && params.roleId !== 'all') query.append('roleId', params.roleId);

    const qString = query.toString();
    return request<{ members: any[]; total: number }>(`/team${qString ? `?${qString}` : ''}`);
  },

  updateMember: async (id: string | number, data: any) => {
    return request<{ message: string; member: any }>(`/team/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  removeMember: async (id: string | number) => {
    return request<{ message: string }>(`/team/${id}`, {
      method: 'DELETE',
    });
  },

  getStats: async () => {
    return request<{ totalMembers: number; activeMembers: number; inactiveMembers: number; byDepartment: any[] }>(
      '/team/stats'
    );
  },
};

// ─── Roles API ────────────────────────────────────────────────────────────────

export const rolesApi = {
  getRoles: async () => {
    return request<{ roles: any[] }>('/roles');
  },

  getPermissionCatalog: async () => {
    return request<{ groups: { module: string; label: string; permissions: { key: string; label: string }[] }[] }>(
      '/roles/permissions'
    );
  },

  createRole: async (data: { name: string; description?: string; permissions: string[] }) => {
    return request<{ message: string; role: any }>('/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRole: async (id: string | number, data: { name?: string; description?: string; permissions?: string[]; isActive?: boolean }) => {
    return request<{ message: string; role: any }>(`/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteRole: async (id: string | number) => {
    return request<{ message: string }>(`/roles/${id}`, {
      method: 'DELETE',
    });
  },
};

// ─── Leads API ────────────────────────────────────────────────────────────────

export const leadsApi = {
  getLeads: async (params: { page?: number; limit?: number; search?: string; status?: string; territory?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    if (params.search) query.append('search', params.search);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    if (params.territory && params.territory !== 'all') query.append('territory', params.territory);

    const qString = query.toString();
    return request<{ leads: any[]; total: number; page: number; pages: number }>(
      `/leads${qString ? `?${qString}` : ''}`
    );
  },

  getLead: async (id: string | number) => {
    return request<any>(`/leads/${id}`);
  },

  createLead: async (leadData: any) => {
    return request<{ message: string; lead: any }>('/leads', {
      method: 'POST',
      body: JSON.stringify(leadData),
    });
  },

  // Task 2.6: duplicate check by email/mobile, called before create to power
  // the "A lead with this email address or mobile number already exists"
  // warning popup.
  checkDuplicate: async (email?: string, mobile?: string, excludeId?: string | number) => {
    const query = new URLSearchParams();
    if (email) query.append('email', email);
    if (mobile) query.append('mobile', mobile);
    if (excludeId) query.append('excludeId', String(excludeId));
    return request<{ duplicate: any | null }>(`/leads/check-duplicate?${query.toString()}`);
  },

  updateLead: async (id: string | number, leadData: any) => {
    return request<{ message: string; lead: any }>(`/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(leadData),
    });
  },

  convertLead: async (
    id: string | number,
    options: { createDeal?: boolean; dealTitle?: string; dealValue?: number; createCompany?: boolean } = {}
  ) => {
    return request<{ message: string; contact: any; deal: any | null }>(`/leads/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  getLeadTimeline: async (id: string | number) => request<{ timeline: any[] }>(`/leads/${id}/timeline`),

  revertLeadChange: async (id: string | number, logId: string | number) =>
    request<{ message: string; lead: any }>(`/leads/${id}/timeline/${logId}/revert`, { method: 'POST' }),

  deleteLead: async (id: string | number) => {
    return request<{ message: string }>(`/leads/${id}`, {
      method: 'DELETE',
    });
  },

  searchCompanies: async (query: string) => {
    return request<{ results: CompanySuggestion[] }>(`/leads/company-search?q=${encodeURIComponent(query)}`);
  },

  getStats: async () => {
    return request<{
      totalLeads: number;
      leadsByStatus: any[];
      leadsBySource: any[];
      averageScore: number;
      totalValue: number;
    }>('/leads/stats');
  },
};

// ─── Deals API ────────────────────────────────────────────────────────────────

export const dealsApi = {
  getDeals: async (params: { page?: number; limit?: number; search?: string; stage?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    if (params.search) query.append('search', params.search);
    if (params.stage && params.stage !== 'all') query.append('stage', params.stage);

    const qString = query.toString();
    return request<{ deals: any[]; total: number; page: number; pages: number }>(
      `/deals${qString ? `?${qString}` : ''}`
    );
  },

  createDeal: async (dealData: any) => {
    return request<{ message: string; deal: any; autoGeneratedQuote?: any }>('/deals', {
      method: 'POST',
      body: JSON.stringify(dealData),
    });
  },

  updateDeal: async (id: string | number, dealData: any) => {
    return request<{ message: string; deal: any; autoGeneratedQuote?: any }>(`/deals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dealData),
    });
  },

  deleteDeal: async (id: string | number) => {
    return request<{ message: string }>(`/deals/${id}`, {
      method: 'DELETE',
    });
  },

  getStats: async () => {
    return request<{
      totalDeals: number;
      dealsByStage: any[];
      totalValue: number;
      averageValue: number;
      winRate: number;
    }>('/deals/stats');
  },
};

// ─── Contacts API ─────────────────────────────────────────────────────────────

export const contactsApi = {
  getContacts: async (params: { page?: number; limit?: number; search?: string; source?: string; leadId?: number | string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    if (params.search) query.append('search', params.search);
    if (params.source) query.append('source', params.source);
    if (params.leadId) query.append('leadId', String(params.leadId));

    const qString = query.toString();
    return request<{ contacts: any[]; total: number; page: number; pages: number }>(
      `/contacts${qString ? `?${qString}` : ''}`
    );
  },

  createContact: async (contactData: any) => {
    return request<{ message: string; contact: any }>('/contacts', {
      method: 'POST',
      body: JSON.stringify(contactData),
    });
  },

  updateContact: async (id: string | number, contactData: any) => {
    return request<{ message: string; contact: any }>(`/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(contactData),
    });
  },

  deleteContact: async (id: string | number) => {
    return request<{ message: string }>(`/contacts/${id}`, {
      method: 'DELETE',
    });
  },

  getStats: async () => {
    return request<{
      totalContacts: number;
      contactsBySource: any[];
      contactsWithEmail: number;
      contactsWithPhone: number;
    }>('/contacts/stats');
  },
};

// ─── Users API (Team management) ───────────────────────────────────────────────

export const usersApi = {
  getUsers: async (params: { search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    const qString = query.toString();
    return request<{ users: any[]; total: number }>(`/users${qString ? `?${qString}` : ''}`);
  },

  // Lightweight endpoint any authenticated user can call (no admin permission
  // required) — used to power "Assign To" typeahead/datalist inputs.
  getAssignableUsers: async (params: { search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    const qString = query.toString();
    return request<{ users: { id: number; firstName: string; lastName: string; name: string; email: string }[]; total: number }>(`/users/assignable${qString ? `?${qString}` : ''}`);
  },

  updateUser: async (id: string | number, data: { roleId?: number; isActive?: boolean; firstName?: string; lastName?: string; phone?: string }) => {
    return request<{ message: string; user: any }>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deactivateUser: async (id: string | number) => {
    return request<{ message: string }>(`/users/${id}`, { method: 'DELETE' });
  },
};

// ─── Tasks API ─────────────────────────────────────────────────────────────────

export const tasksApi = {
  getTasks: async (params: { search?: string; status?: string; priority?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    if (params.priority && params.priority !== 'all') query.append('priority', params.priority);
    const qs = query.toString();
    return request<{ tasks: any[]; total: number }>(`/tasks${qs ? `?${qs}` : ''}`);
  },
  createTask: async (data: any) => request<{ message: string; task: any }>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: async (id: string | number, data: any) => request<{ message: string; task: any }>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: async (id: string | number) => request<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' }),
};

// ─── Meetings API ──────────────────────────────────────────────────────────────

export const meetingsApi = {
  getMeetings: async (params: { search?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    const qs = query.toString();
    return request<{ meetings: any[]; total: number }>(`/meetings${qs ? `?${qs}` : ''}`);
  },
  createMeeting: async (data: any) => request<{ message: string; meeting: any }>('/meetings', { method: 'POST', body: JSON.stringify(data) }),
  updateMeeting: async (id: string | number, data: any) => request<{ message: string; meeting: any }>(`/meetings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMeeting: async (id: string | number) => request<{ message: string }>(`/meetings/${id}`, { method: 'DELETE' }),
};

// ─── Company Settings API ───────────────────────────────────────────────────────

export const companyApi = {
  getCompany: async () => request<any>('/company'),
  updateCompany: async (data: any) => request<{ message: string; company: any }>('/company', { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── System Settings API (Super Admin only) ──────────────────────────────────────

export const settingsApi = {
  getEnvVars: async () => request<{ envVars: { key: string; value: string; isSet: boolean }[] }>('/settings/env'),
  updateEnvVars: async (envVars: Record<string, string>) => request<{ message: string }>('/settings/env', {
    method: 'PUT',
    body: JSON.stringify({ envVars }),
  }),
};

// ─── Item Categories API ───────────────────────────────────────────────────────

export const itemCategoriesApi = {
  getCategories: async (params: { search?: string; isActive?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.isActive !== undefined) query.append('isActive', String(params.isActive));
    const qs = query.toString();
    return request<{ categories: any[] }>(`/item-categories${qs ? `?${qs}` : ''}`);
  },
  createCategory: async (data: any) => request<{ message: string; category: any }>('/item-categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: async (id: string | number, data: any) => request<{ message: string; category: any }>(`/item-categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: async (id: string | number) => request<{ message: string }>(`/item-categories/${id}`, { method: 'DELETE' }),
};

// ─── Tax Master API ─────────────────────────────────────────────────────────────

export const taxesApi = {
  getTaxes: async (params: { search?: string; isActive?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.isActive !== undefined) query.append('isActive', String(params.isActive));
    const qs = query.toString();
    return request<{ taxes: any[] }>(`/taxes${qs ? `?${qs}` : ''}`);
  },
  createTax: async (data: any) => request<{ message: string; tax: any }>('/taxes', { method: 'POST', body: JSON.stringify(data) }),
  updateTax: async (id: string | number, data: any) => request<{ message: string; tax: any }>(`/taxes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTax: async (id: string | number) => request<{ message: string }>(`/taxes/${id}`, { method: 'DELETE' }),
};

// ─── Items API ───────────────────────────────────────────────────────────────────

export const itemsApi = {
  getItems: async (params: { page?: number; limit?: number; search?: string; categoryId?: number | string; isActive?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    if (params.search) query.append('search', params.search);
    if (params.categoryId) query.append('categoryId', String(params.categoryId));
    if (params.isActive !== undefined) query.append('isActive', String(params.isActive));
    const qs = query.toString();
    return request<{ items: any[]; total: number; page: number; pages: number }>(`/items${qs ? `?${qs}` : ''}`);
  },
  createItem: async (data: any) => request<{ message: string; item: any }>('/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: async (id: string | number, data: any) => request<{ message: string; item: any }>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: async (id: string | number) => request<{ message: string }>(`/items/${id}`, { method: 'DELETE' }),
  getStats: async () => request<{ totalItems: number; activeItems: number; totalCategories: number; totalTaxes: number }>('/items/stats'),
};

// ─── Quotes API ────────────────────────────────────────────────────────────────

export const quotesApi = {
  getQuotes: async (params: { search?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    const qs = query.toString();
    return request<{ quotes: any[]; total: number }>(`/quotes${qs ? `?${qs}` : ''}`);
  },
  getQuote: async (id: string | number) => request<any>(`/quotes/${id}`),
  createQuote: async (data: any) => request<{ message: string; quote: any }>('/quotes', { method: 'POST', body: JSON.stringify(data) }),
  createQuoteFromLead: async (leadId: string | number, overrides: any = {}) => request<{ message: string; quote: any }>(`/quotes/from-lead/${leadId}`, { method: 'POST', body: JSON.stringify(overrides) }),
  createQuoteFromDeal: async (dealId: string | number, overrides: any = {}) => request<{ message: string; quote: any }>(`/quotes/from-deal/${dealId}`, { method: 'POST', body: JSON.stringify(overrides) }),
  updateQuote: async (id: string | number, data: any) => request<{ message: string; quote: any }>(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteQuote: async (id: string | number) => request<{ message: string }>(`/quotes/${id}`, { method: 'DELETE' }),
  // Note: WhatsApp sending was never implemented server-side; only email delivery (with a generated PDF attached) is supported.
  sendQuote: async (id: string | number, payload: { method: 'email' | 'whatsapp'; email?: string; phone?: string }) => {
    return request<{ message: string; sent: boolean; recipient: string }>(`/quotes/${id}/send-email`, {
      method: 'POST',
      body: JSON.stringify({ email: payload.email }),
    });
  },
  reviseQuote: async (id: string | number) => request<{ message: string; quote: any }>(`/quotes/${id}/revise`, { method: 'POST' }),
  acceptQuote: async (id: string | number) => request<{ message: string; quote: any; deal: any }>(`/quotes/${id}/accept`, { method: 'POST' }),
  approveQuote: async (id: string | number) => request<{ message: string; quote: any; invoice: any }>(`/quotes/${id}/approve`, { method: 'POST' }),
  rejectQuote: async (id: string | number) => request<{ message: string; quote: any }>(`/quotes/${id}/reject`, { method: 'POST' }),
  getQuotePdfUrl: (id: string | number) => `${API_BASE}/quotes/${id}/pdf`,
  getQuotePrintUrl: (id: string | number) => `${API_BASE}/quotes/${id}/print`,
  // Strategic share message (Phase 8) + dynamic public link (Phase 4/9) for the "Send Quote" flow.
  getShareContent: async (id: string | number) =>
    request<{ message: string; quoteLink: string; customerPhone: string | null; customerEmail: string | null; quoteNumber: string }>(
      `/quotes/${id}/share-preview`
    ),
};

// ─── Invoices API ──────────────────────────────────────────────────────────────

export const invoicesApi = {
  getInvoices: async (params: { search?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    const qs = query.toString();
    return request<{ invoices: any[]; total: number }>(`/invoices${qs ? `?${qs}` : ''}`);
  },
  createInvoice: async (data: any) => request<{ message: string; invoice: any }>('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: async (id: string | number, data: any) => request<{ message: string; invoice: any }>(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInvoice: async (id: string | number) => request<{ message: string }>(`/invoices/${id}`, { method: 'DELETE' }),
};

// ─── Campaigns API ─────────────────────────────────────────────────────────────

export const campaignsApi = {
  getCampaigns: async (params: { search?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    const qs = query.toString();
    return request<{ campaigns: any[]; total: number }>(`/campaigns${qs ? `?${qs}` : ''}`);
  },
  getStats: async () => request<any>('/campaigns/stats'),
  createCampaign: async (data: any) => request<{ message: string; campaign: any }>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  updateCampaign: async (id: string | number, data: any) => request<{ message: string; campaign: any }>(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCampaign: async (id: string | number) => request<{ message: string }>(`/campaigns/${id}`, { method: 'DELETE' }),
};

// ─── Templates API ─────────────────────────────────────────────────────────────

export const templatesApi = {
  getTemplates: async (params: { search?: string; type?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.type && params.type !== 'all') query.append('type', params.type);
    const qs = query.toString();
    return request<{ templates: any[]; total: number }>(`/templates${qs ? `?${qs}` : ''}`);
  },
  createTemplate: async (data: any) => request<{ message: string; template: any }>('/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: async (id: string | number, data: any) => request<{ message: string; template: any }>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTemplate: async (id: string | number) => request<{ message: string }>(`/templates/${id}`, { method: 'DELETE' }),
  useTemplate: async (id: string | number) => request<{ message: string; template: any }>(`/templates/${id}/use`, { method: 'POST' }),
};

// ─── Activity Logs API ────────────────────────────────────────────────────────
export const activityLogsApi = {
  getLogs: async (params: { page?: number; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return request<{ logs: any[]; total: number; page: number; pages: number }>(`/activity-logs${qs ? `?${qs}` : ''}`);
  },
};

// ─── Recycle Bin API ──────────────────────────────────────────────────────────
export const recycleBinApi = {
  getDeletedRecords: async () => request<{ records: any[] }>('/recycle-bin'),
  restoreRecord: async (type: string, id: string | number) => {
    return request<{ message: string }>('/recycle-bin/restore', {
      method: 'POST',
      body: JSON.stringify({ type, id }),
    });
  },
};

// ─── Global Search API ────────────────────────────────────────────────────────
export interface GlobalSearchResult {
  type: 'lead' | 'deal' | 'contact';
  id: number;
  title: string;
  subtitle: string;
  url: string;
}

export interface CompanySuggestion {
  type: 'company' | 'contact';
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  industry: string | null;
  contactName: string | null;
  contactTitle: string | null;
}

export const searchApi = {
  globalSearch: async (q: string) => {
    const query = new URLSearchParams({ q });
    return request<{
      query: string;
      results: GlobalSearchResult[];
      leads: GlobalSearchResult[];
      deals: GlobalSearchResult[];
      contacts: GlobalSearchResult[];
    }>(`/search?${query.toString()}`);
  },
};

// ─── Notifications API ────────────────────────────────────────────────────────
export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
  isRead: boolean;
  createdAt: string;
}

export const notificationsApi = {
  getNotifications: async (params: { unreadOnly?: boolean; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.unreadOnly) query.append('unreadOnly', 'true');
    if (params.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return request<{ notifications: Notification[]; unreadCount: number; total: number }>(`/notifications${qs ? `?${qs}` : ''}`);
  },
  markAsRead: async (id: string | number) => {
    return request<{ message: string; notification: Notification }>(`/notifications/${id}/read`, { method: 'PATCH' });
  },
  markAllAsRead: async () => {
    return request<{ message: string }>(`/notifications/read-all`, { method: 'PATCH' });
  },
  deleteNotification: async (id: string | number) => {
    return request<{ message: string }>(`/notifications/${id}`, { method: 'DELETE' });
  },
};
