import axios from 'axios';
import { API_BASE } from '../api';

export interface UserRequest {
  id: string;
  full_name: string;
  username: string;
  email: string;
  password_masked: string;
  password_raw?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  platform?: string;
  selected_platform?: string; // For legacy UI compatibility
  created_at?: string;
  requested_at_timestamp?: string; // For legacy UI compatibility
  approved_at_timestamp?: string;
  rejected_at_timestamp?: string;
  approved_by?: string;
  rejected_by?: string;
  roles?: string[];
  credentials?: any;
  last_login_at?: string;
}

// Simulated client-side encryption (Reverse + Base64 with mock prefix)
export const encryptData = (text: string): string => {
  if (!text) return '';
  const reversed = text.split('').reverse().join('');
  return 'mock_enc_' + btoa(unescape(encodeURIComponent(reversed)));
};

export const decryptData = (ciphertext: string): string => {
  if (!ciphertext) return '';
  if (!ciphertext.startsWith('mock_enc_')) return ciphertext;
  try {
    const rawCipher = ciphertext.substring('mock_enc_'.length);
    const decoded = decodeURIComponent(escape(atob(rawCipher)));
    return decoded.split('').reverse().join('');
  } catch {
    return ciphertext;
  }
};

class AuthServiceClass {
  // Create user signup request
  async createUserRequest(user: Omit<UserRequest, 'id' | 'status' | 'requested_at_timestamp'>): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(`${API_BASE}/auth/register`, {
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        password_raw: user.password_raw,
        selected_platform: user.selected_platform
      });
      return { success: true, message: response.data.message };
    } catch (error: any) {
      return { success: false, message: error.response?.data?.detail || 'Registration failed' };
    }
  }

  // Authenticate user sign in
  async authenticateUser(username: string, password_raw: string): Promise<{ success: boolean; status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED'; message: string; user?: UserRequest }> {
    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        username: username,
        password: password_raw
      });
      return { 
        success: true, 
        status: response.data.user.status, 
        message: response.data.message, 
        user: response.data.user 
      };
    } catch (error: any) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      
      let userStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | undefined = undefined;
      
      if (status === 403) {
        if (detail?.includes('awaiting admin approval')) userStatus = 'PENDING';
        if (detail?.includes('rejected by admin')) userStatus = 'REJECTED';
        if (detail?.includes('revoked')) userStatus = 'REVOKED';
        return { success: false, status: userStatus, message: detail };
      }
      
      return { success: false, message: detail || 'Invalid username or password' };
    }
  }

  // Update user connection credentials
  async updateUserCredentials(username: string, platform: string, credentials: any): Promise<{ success: boolean; message: string }> {
    try {
      const secureCreds = { ...credentials };
      if (secureCreds.password) {
        secureCreds.password = encryptData(secureCreds.password);
      }
      if (secureCreds.token) {
        secureCreds.token = encryptData(secureCreds.token);
      }

      const response = await axios.post(`${API_BASE}/auth/update_credentials`, {
        username,
        platform: platform.toLowerCase(),
        credentials: secureCreds
      });
      return { success: true, message: response.data.message };
    } catch (error: any) {
      return { success: false, message: error.response?.data?.detail || 'Failed to update credentials' };
    }
  }

  // Update user active role
  async updateUserRole(username: string, role: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(`${API_BASE}/auth/update_role`, {
        username,
        role
      });
      return { success: true, message: response.data.message };
    } catch (error: any) {
      return { success: false, message: error.response?.data?.detail || 'Failed to update role' };
    }
  }
  
  // Legacy Migration - Push localStorage users to backend
  async migrateLegacyUsers(): Promise<void> {
    try {
      const storedStr = localStorage.getItem('robin_users_db');
      if (storedStr) {
        const users = JSON.parse(storedStr);
        if (Array.isArray(users) && users.length > 0) {
          console.log(`Migrating ${users.length} legacy users to backend...`);
          await axios.post(`${API_BASE}/auth/migrate_legacy_users`, { users });
          // Clear it after successful migration
          localStorage.removeItem('robin_users_db');
          console.log('Legacy user migration complete.');
        }
      }
    } catch (e) {
      console.error('Failed to migrate legacy users', e);
    }
  }
}

export const authService = new AuthServiceClass();
