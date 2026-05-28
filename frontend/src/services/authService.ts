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
  selected_platform: string;
  roles?: string[];
  credentials?: any;
}

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
  approveUser(id: string): { success: boolean; message: string } {
    const users = this.getStorageItem('robin_users_db') as UserRequest[];
    const idx = users.findIndex(u => u.id === id);
    
    if (idx === -1) {
      return { success: false, message: 'User request not found.' };
    }

    users[idx].status = 'APPROVED';
    users[idx].approved_at_timestamp = new Date().toLocaleString();
    users[idx].roles = ['USER']; // default user role for future Snowflake integrations
    this.setStorageItem('robin_users_db', users);

    return { success: true, message: 'User approved successfully' };
  }

  // Reject a user request
  rejectUser(id: string): { success: boolean; message: string } {
    const users = this.getStorageItem('robin_users_db') as UserRequest[];
    const idx = users.findIndex(u => u.id === id);
    
    if (idx === -1) {
      return { success: false, message: 'User request not found.' };
    }

    users[idx].status = 'REJECTED';
    users[idx].rejected_at_timestamp = new Date().toLocaleString();
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
      return { success: false, status: 'PENDING', message: 'Your request is awaiting approval from admin.' };
    }

    if (user.status === 'REJECTED') {
      return { success: false, status: 'REJECTED', message: 'Your signup request was rejected by admin.' };
    }

    return { success: true, status: 'APPROVED', message: 'Login successful.', user };
  }
}

export const authService = new AuthServiceClass();
