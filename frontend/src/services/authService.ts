export interface UserRequest {
  id: string;
  full_name: string;
  username: string;
  email: string;
  password_masked: string;
  password_raw: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at_timestamp: string;
  approved_at_timestamp?: string;
  rejected_at_timestamp?: string;
  approved_by?: string;
  rejected_by?: string;
  selected_platform: string;
  roles?: string[];
  credentials?: any;
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
  private getStorageItem(key: string): any[] {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }

  private setStorageItem(key: string, data: any[]): void {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // Get all users by their approval status
  getUsersByStatus(status: 'PENDING' | 'APPROVED' | 'REJECTED'): UserRequest[] {
    const users = this.getStorageItem('robin_users_db') as UserRequest[];
    return users.filter(u => u.status === status);
  }

  // Create user signup request
  createUserRequest(user: Omit<UserRequest, 'id' | 'status' | 'requested_at_timestamp'>): { success: boolean; message: string } {
    const users = this.getStorageItem('robin_users_db') as UserRequest[];
    
    // Check if username already exists (case-insensitive, across all requests)
    const usernameExists = users.some(u => u.username.toLowerCase() === user.username.toLowerCase());
    if (usernameExists) {
      return { success: false, message: 'Username is already taken.' };
    }

    // Check if email already registered (case-insensitive)
    const emailExists = users.some(u => u.email.toLowerCase() === user.email.toLowerCase());
    if (emailExists) {
      return { success: false, message: 'Email is already registered.' };
    }

    const newRequest: UserRequest = {
      ...user,
      id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      status: 'PENDING',
      requested_at_timestamp: new Date().toLocaleString(),
      roles: [],
      credentials: {}
    };

    users.push(newRequest);
    this.setStorageItem('robin_users_db', users);

    return { success: true, message: 'Signup successful. Your request is submitted for admin approval.' };
  }

  // Approve a user request
  approveUser(id: string, adminUsername: string): { success: boolean; message: string } {
    const users = this.getStorageItem('robin_users_db') as UserRequest[];
    const idx = users.findIndex(u => u.id === id);
    
    if (idx === -1) {
      return { success: false, message: 'User request not found.' };
    }

    users[idx].status = 'APPROVED';
    users[idx].approved_at_timestamp = new Date().toLocaleString();
    users[idx].approved_by = adminUsername;
    users[idx].roles = ['PUBLIC']; // PUBLIC is the default role now
    this.setStorageItem('robin_users_db', users);

    return { success: true, message: 'User approved successfully' };
  }

  // Reject a user request
  rejectUser(id: string, adminUsername: string): { success: boolean; message: string } {
    const users = this.getStorageItem('robin_users_db') as UserRequest[];
    const idx = users.findIndex(u => u.id === id);
    
    if (idx === -1) {
      return { success: false, message: 'User request not found.' };
    }

    users[idx].status = 'REJECTED';
    users[idx].rejected_at_timestamp = new Date().toLocaleString();
    users[idx].rejected_by = adminUsername;
    this.setStorageItem('robin_users_db', users);

    return { success: true, message: 'User request rejected' };
  }

  // Authenticate user sign in
  authenticateUser(username: string, password_raw: string): { success: boolean; status?: 'PENDING' | 'APPROVED' | 'REJECTED'; message: string; user?: UserRequest } {
    const users = this.getStorageItem('robin_users_db') as UserRequest[];
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) {
      return { success: false, message: 'User not found. Please sign up.' };
    }

    if (user.password_raw !== password_raw) {
      return { success: false, message: 'Invalid username or password' };
    }

    if (user.status === 'PENDING') {
      return { success: false, status: 'PENDING', message: 'Your access request is awaiting admin approval. Please try again later.' };
    }

    if (user.status === 'REJECTED') {
      return { success: false, status: 'REJECTED', message: 'Your signup request was rejected by admin.' };
    }

    return { success: true, status: 'APPROVED', message: 'Login successful.', user };
  }

  // Update user connection credentials
  updateUserCredentials(username: string, platform: string, credentials: any): { success: boolean; message: string } {
    const users = this.getStorageItem('robin_users_db') as UserRequest[];
    const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (idx === -1) {
      return { success: false, message: 'User not found.' };
    }

    const secureCreds = { ...credentials };
    if (secureCreds.password) {
      secureCreds.password = encryptData(secureCreds.password);
    }
    if (secureCreds.token) {
      secureCreds.token = encryptData(secureCreds.token);
    }

    users[idx].credentials = secureCreds;
    users[idx].selected_platform = platform.toLowerCase();
    this.setStorageItem('robin_users_db', users);

    return { success: true, message: 'Platform credentials saved successfully.' };
  }

  // Update user active role
  updateUserRole(username: string, role: string): { success: boolean; message: string } {
    const users = this.getStorageItem('robin_users_db') as UserRequest[];
    const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (idx === -1) {
      return { success: false, message: 'User not found.' };
    }

    if (!users[idx].roles) {
      users[idx].roles = [];
    }
    if (!users[idx].roles.includes(role)) {
      users[idx].roles.push(role);
    }

    this.setStorageItem('robin_users_db', users);
    return { success: true, message: 'Active role updated successfully.' };
  }

  // Simulates SHOW GRANTS TO USER <username> query output
  simulateShowGrantsToUser(username: string): Array<{ privilege: string; granted_on: string; name: string }> {
    if (username.toLowerCase() === 'norolesuser') {
      return [];
    }
    return [
      { privilege: 'USAGE', granted_on: 'ROLE', name: 'PUBLIC' },
      { privilege: 'USAGE', granted_on: 'ROLE', name: 'SYSADMIN' },
      { privilege: 'USAGE', granted_on: 'ROLE', name: 'NEW_ROLE_ROMA' },
      { privilege: 'OWNERSHIP', granted_on: 'ROLE', name: 'SYSADMIN' },
      { privilege: 'USAGE', granted_on: 'DATABASE', name: 'DEMO_DB' },
      { privilege: 'USAGE', granted_on: 'ROLE', name: 'PUBLIC' },
      { privilege: 'USAGE', granted_on: 'ROLE', name: 'NEW_ROLE_ROMA' },
      { privilege: 'USAGE', granted_on: 'ROLE', name: 'ANALYST_ROLE' }
    ];
  }

  // Simulates Databricks Workspace groups
  simulateDatabricksWorkspaceGroups(username: string): Array<{ groupName: string }> {
    if (username.toLowerCase() === 'norolesuser') {
      return [];
    }
    return [
      { groupName: 'PUBLIC' },
      { groupName: 'ADMIN_GROUP' },
      { groupName: 'DATA_ENGINEERS' },
      { groupName: 'DATA_SCIENTISTS' },
      { groupName: 'ANALYSTS' }
    ];
  }

  // Fetch available roles based on username and platform
  fetchUserRoles(username: string, platform: string): string[] {
    const p = platform.toLowerCase();
    console.log(`[DEBUG LOG] Conceptual Query Executed: SHOW GRANTS TO USER ${username};`);
    
    if (p === 'snowflake') {
      const rawGrants = this.simulateShowGrantsToUser(username);
      console.log(`[DEBUG LOG] Roles fetched response (Raw SHOW GRANTS output):`, rawGrants);

      // Filter privilege = 'USAGE' and granted_on = 'ROLE'
      const matchingRows = rawGrants.filter(row => row.privilege === 'USAGE' && row.granted_on === 'ROLE');
      console.log(`[DEBUG LOG] Matching rows (privilege='USAGE', granted_on='ROLE'):`, matchingRows);

      // Extract, deduplicate, and sort alphabetically
      const roleNames = matchingRows.map(row => row.name);
      const finalRoles = Array.from(new Set(roleNames)).sort();
      console.log(`[DEBUG LOG] Final Snowflake roles array:`, finalRoles);

      return finalRoles;
    } else if (p === 'databricks') {
      const rawGroups = this.simulateDatabricksWorkspaceGroups(username);
      console.log(`[DEBUG LOG] Roles fetched response (Raw Databricks groups):`, rawGroups);

      const finalRoles = Array.from(new Set(rawGroups.map(g => g.groupName))).sort();
      console.log(`[DEBUG LOG] Final Databricks roles array:`, finalRoles);

      return finalRoles;
    }
    return ['PUBLIC'];
  }
}

export const authService = new AuthServiceClass();
